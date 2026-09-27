const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const File = require('../models/File');
const Folder = require('../models/Folder');
const FilePermission = require('../models/FilePermission');
const FileVersion = require('../models/FileVersion');
const storageService = require('../services/storageService');
const auditService = require('../services/auditService');

const uploadFile = async (req, res, next) => {
  try {
    const { originalName, mimeType, encryptedFileKey, iv, folderId } = req.body;
    const tempFilePath = req.file.path;
    const encryptedSize = req.file.size;

    // Generate unique S3/Vault object key
    const s3ObjectKey = `vault-${uuidv4()}-${Date.now()}.bin`;

    // Stream from temporary upload to permanent storage (S3 or local fallback)
    await storageService.uploadFile(s3ObjectKey, tempFilePath, mimeType || 'application/octet-stream');

    // Clean up temporary upload file safely
    fs.unlink(tempFilePath, (err) => {
      if (err) console.warn('[Storage Warning] Could not remove temp file:', err.message);
    });

    // Parse encryptedFileKey if passed as stringified JSON from FormData
    let parsedFileKey = encryptedFileKey;
    if (typeof encryptedFileKey === 'string') {
      try {
        parsedFileKey = JSON.parse(encryptedFileKey);
      } catch (e) {
        parsedFileKey = encryptedFileKey;
      }
    }

    // Save metadata in MongoDB File collection
    const file = await File.create({
      originalName: originalName.trim(),
      ownerId: req.user._id,
      folderId: folderId && folderId !== 'null' && folderId !== 'root' ? folderId : null,
      s3ObjectKey,
      encryptedSize,
      mimeType: mimeType || 'application/octet-stream',
      encryptedFileKey: parsedFileKey,
      encryptionAlgorithm: 'AES-256-GCM',
      iv,
      status: 'active',
      currentVersion: 1,
    });

    // Create initial Version 1 entry in FileVersion schema
    await FileVersion.create({
      fileId: file._id,
      versionNumber: 1,
      s3ObjectKey,
      encryptedSize,
      mimeType: file.mimeType,
      iv,
      uploadedBy: req.user._id,
      changeSummary: 'Initial upload',
      createdAt: file.createdAt,
    });

    // Write immutable audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'upload',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        size: file.encryptedSize,
        mimeType: file.mimeType,
        version: 1,
        actionDetail: 'Uploaded initial file version v1',
      },
    });

    res.status(201).json({
      success: true,
      message: 'File encrypted and stored securely.',
      file: {
        id: file._id,
        originalName: file.originalName,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        currentVersion: 1,
        createdAt: file.createdAt,
      },
    });
  } catch (err) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    next(err);
  }
};

const listFiles = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { folderId, all } = req.query;

    const ownedQuery = {
      ownerId: userId,
      status: 'active',
    };

    if (all !== 'true' && folderId !== undefined) {
      ownedQuery.folderId = folderId === 'root' || folderId === 'null' || !folderId ? null : folderId;
    }

    // 1. Files owned by the user
    const ownedFiles = await File.find(ownedQuery)
      .sort({ createdAt: -1 })
      .populate('ownerId', 'name email');

    // 2. Files shared with the user
    const sharedPermissions = await FilePermission.find({
      userId,
    })
      .populate({
        path: 'fileId',
        match: { status: 'active' },
        populate: { path: 'ownerId', select: 'name email' },
      })
      .populate('grantedBy', 'name email');

    const formattedOwned = ownedFiles.map((f) => ({
      id: f._id,
      originalName: f.originalName,
      folderId: f.folderId || null,
      encryptedSize: f.encryptedSize,
      mimeType: f.mimeType,
      encryptionAlgorithm: f.encryptionAlgorithm,
      iv: f.iv,
      encryptedFileKey: f.encryptedFileKey,
      isOwner: true,
      role: 'owner',
      currentVersion: f.currentVersion || 1,
      owner: {
        id: f.ownerId._id,
        name: f.ownerId.name,
        email: f.ownerId.email,
      },
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));

    let formattedShared = sharedPermissions
      .filter((p) => p.fileId != null) // Filter out deleted files
      .map((p) => ({
        id: p.fileId._id,
        originalName: p.fileId.originalName,
        folderId: p.fileId.folderId || null,
        encryptedSize: p.fileId.encryptedSize,
        mimeType: p.fileId.mimeType,
        encryptionAlgorithm: p.fileId.encryptionAlgorithm,
        iv: p.fileId.iv,
        wrappedFileKey: p.wrappedFileKey,
        isOwner: false,
        role: p.role,
        currentVersion: p.fileId.currentVersion || 1,
        owner: p.fileId.ownerId
          ? {
              id: p.fileId.ownerId._id,
              name: p.fileId.ownerId.name,
              email: p.fileId.ownerId.email,
            }
          : { name: 'Owner', email: '' },
        sharedBy: p.grantedBy
          ? {
              id: p.grantedBy._id,
              name: p.grantedBy.name,
              email: p.grantedBy.email,
            }
          : null,
        sharedAt: p.createdAt,
        createdAt: p.fileId.createdAt,
      }));

    // If filtering by folder
    if (all !== 'true' && folderId !== undefined) {
      if (folderId && folderId !== 'root' && folderId !== 'null') {
        // Show files inside this specific folder
        formattedShared = formattedShared.filter(
          (f) => f.folderId && f.folderId.toString() === folderId.toString()
        );
      } else {
        // At the root level of "Shared with me":
        // Only show files that are NOT inside a folder that is shared with the user
        const userSharedFolders = await Folder.find(
          { 'sharedWith.userId': userId, status: 'active' },
          '_id'
        );
        const sharedFolderIdSet = new Set(userSharedFolders.map((f) => f._id.toString()));
        formattedShared = formattedShared.filter(
          (f) => !f.folderId || !sharedFolderIdSet.has(f.folderId.toString())
        );
      }
    }

    res.status(200).json({
      success: true,
      files: formattedOwned,
      sharedFiles: formattedShared,
    });
  } catch (err) {
    next(err);
  }
};

const getFile = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Attached by checkFileAccess middleware
    await file.populate('ownerId', 'name email');

    // If user is accessing (viewer / editor non-owner), log preview/view access
    if (req.userRole !== 'owner') {
      await auditService.log({
        fileId: file._id,
        actorId: req.user._id,
        action: 'preview',
        ipAddress: req.ip || req.connection.remoteAddress,
        metadata: {
          originalName: file.originalName,
          role: req.userRole,
          version: file.currentVersion || 1,
          actionDetail: `Viewed file details (v${file.currentVersion || 1})`,
        },
      });
    }

    res.status(200).json({
      success: true,
      file: {
        id: file._id,
        originalName: file.originalName,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        encryptionAlgorithm: file.encryptionAlgorithm,
        iv: file.iv,
        wrappedFileKey: req.wrappedFileKey,
        role: req.userRole,
        isOwner: req.userRole === 'owner',
        currentVersion: file.currentVersion || 1,
        owner: {
          id: file.ownerId._id,
          name: file.ownerId.name,
          email: file.ownerId.email,
        },
        createdAt: file.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

const downloadFile = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Attached by checkFileAccess middleware
    const { purpose } = req.query;

    const action = (purpose === 'preview' || req.userRole === 'viewer') ? 'preview' : 'download';
    const actionDetail = action === 'preview'
      ? `Previewed encrypted content (v${file.currentVersion || 1})`
      : `Downloaded file payload (v${file.currentVersion || 1})`;

    // Write audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action,
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        role: req.userRole,
        version: file.currentVersion || 1,
        purpose: purpose || action,
        actionDetail,
      },
    });

    const fileStream = await storageService.getFileStream(file.s3ObjectKey);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}.enc"`);
    res.setHeader('Content-Length', file.encryptedSize);
    res.setHeader('X-Encryption-IV', file.iv);
    res.setHeader('X-Encryption-Algorithm', file.encryptionAlgorithm);

    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
};

const deleteFile = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Attached by checkFileAccess('owner')

    // Mark as deleted in DB
    file.status = 'deleted';
    await file.save();

    // Remove permissions
    await FilePermission.deleteMany({ fileId: file._id });

    // Clean up FileVersion documents
    await FileVersion.deleteMany({ fileId: file._id });

    // Remove from physical storage
    await storageService.deleteFile(file.s3ObjectKey);

    // Audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'delete',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        actionDetail: 'Deleted file and removed all versions',
      },
    });

    res.status(200).json({
      success: true,
      message: 'File deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
};

const renameFile = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'A valid file name is required.' });
    }

    const oldName = file.originalName;
    const newName = name.trim();

    file.originalName = newName;
    await file.save();

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'file_rename',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        oldName,
        newName,
        actionDetail: `Renamed file from "${oldName}" to "${newName}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'File renamed successfully.',
      file: {
        id: file._id,
        originalName: file.originalName,
        folderId: file.folderId,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        currentVersion: file.currentVersion || 1,
        updatedAt: file.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// FILE VERSION MANAGEMENT
// ==========================================

const listVersions = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('viewer')

    let versions = await FileVersion.find({ fileId: file._id })
      .sort({ versionNumber: -1 })
      .populate('uploadedBy', 'name email avatar');

    if (versions.length === 0) {
      // Legacy fallback: synthesize v1 from the existing file
      await file.populate('ownerId', 'name email avatar');
      versions = [
        {
          id: file._id,
          versionNumber: file.currentVersion || 1,
          encryptedSize: file.encryptedSize,
          mimeType: file.mimeType,
          uploadedBy: file.ownerId
            ? {
                id: file.ownerId._id,
                name: file.ownerId.name,
                email: file.ownerId.email,
                avatar: file.ownerId.avatar || '',
              }
            : { name: 'Owner', email: '' },
          changeSummary: 'Initial upload',
          createdAt: file.createdAt,
          isCurrent: true,
        },
      ];
    } else {
      versions = versions.map((v) => ({
        id: v._id,
        versionNumber: v.versionNumber,
        encryptedSize: v.encryptedSize,
        mimeType: v.mimeType,
        uploadedBy: v.uploadedBy
          ? {
              id: v.uploadedBy._id,
              name: v.uploadedBy.name,
              email: v.uploadedBy.email,
              avatar: v.uploadedBy.avatar || '',
            }
          : { name: 'Unknown User', email: '' },
        changeSummary: v.changeSummary,
        createdAt: v.createdAt,
        isCurrent: v.versionNumber === (file.currentVersion || 1),
      }));
    }

    res.status(200).json({
      success: true,
      currentVersion: file.currentVersion || 1,
      versions,
    });
  } catch (err) {
    next(err);
  }
};

const createVersion = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('editor')
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Encrypted version payload file is required.',
      });
    }

    const { iv, changeSummary, mimeType } = req.body;
    if (!iv) {
      return res.status(400).json({
        success: false,
        error: 'Encryption initialization vector (IV) is required.',
      });
    }

    const tempFilePath = req.file.path;
    const encryptedSize = req.file.size;
    const nextVersion = (file.currentVersion || 1) + 1;

    // Generate unique S3/storage object key for this version
    const s3ObjectKey = `vault-v${nextVersion}-${uuidv4()}-${Date.now()}.bin`;

    await storageService.uploadFile(
      s3ObjectKey,
      tempFilePath,
      mimeType || file.mimeType || 'application/octet-stream'
    );

    fs.unlink(tempFilePath, (err) => {
      if (err) console.warn('[Storage Warning] Could not remove temp version file:', err.message);
    });

    // Check if initial v1 exists; if not, backfill it from file
    const existingCount = await FileVersion.countDocuments({ fileId: file._id });
    if (existingCount === 0) {
      await FileVersion.create({
        fileId: file._id,
        versionNumber: file.currentVersion || 1,
        s3ObjectKey: file.s3ObjectKey,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        iv: file.iv,
        uploadedBy: file.ownerId,
        changeSummary: 'Initial upload',
        createdAt: file.createdAt,
      });
    }

    // Create new FileVersion record
    const newVersionDoc = await FileVersion.create({
      fileId: file._id,
      versionNumber: nextVersion,
      s3ObjectKey,
      encryptedSize,
      mimeType: mimeType || file.mimeType,
      iv,
      uploadedBy: req.user._id,
      changeSummary: changeSummary || `Version ${nextVersion} update`,
      createdAt: new Date(),
    });

    // Update File document
    file.currentVersion = nextVersion;
    file.s3ObjectKey = s3ObjectKey;
    file.encryptedSize = encryptedSize;
    file.iv = iv;
    if (mimeType) file.mimeType = mimeType;
    await file.save();

    // Immutable audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'edit',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        version: nextVersion,
        originalName: file.originalName,
        size: encryptedSize,
        changeSummary: changeSummary || `Version ${nextVersion} update`,
        editorName: req.user.name,
        editorEmail: req.user.email,
        actionDetail: `Edited file and created version v${nextVersion}`,
      },
    });

    res.status(201).json({
      success: true,
      message: `Version ${nextVersion} created successfully.`,
      version: {
        versionNumber: nextVersion,
        encryptedSize,
        createdAt: newVersionDoc.createdAt,
        changeSummary: newVersionDoc.changeSummary,
      },
      file: {
        id: file._id,
        originalName: file.originalName,
        currentVersion: nextVersion,
        encryptedSize,
        mimeType: file.mimeType,
      },
    });
  } catch (err) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    next(err);
  }
};

const downloadVersion = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('viewer')
    const { versionNumber } = req.params;
    const { purpose } = req.query;

    if (req.userRole === 'viewer' && purpose !== 'preview') {
      return res.status(403).json({
        success: false,
        error: 'Viewers cannot download file payloads directly. Only preview is allowed.',
      });
    }

    const versionDoc = await FileVersion.findOne({
      fileId: file._id,
      versionNumber: Number(versionNumber),
    });

    if (!versionDoc) {
      return res.status(404).json({
        success: false,
        error: `Version ${versionNumber} not found for this file.`,
      });
    }

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'download',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        version: Number(versionNumber),
        purpose: purpose || 'download',
        actionDetail: `Downloaded encrypted payload for version v${versionNumber}`,
      },
    });

    const fileStream = await storageService.getFileStream(versionDoc.s3ObjectKey);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}.v${versionNumber}.enc"`
    );
    res.setHeader('Content-Length', versionDoc.encryptedSize);
    res.setHeader('X-Encryption-IV', versionDoc.iv);
    res.setHeader('X-Encryption-Algorithm', file.encryptionAlgorithm || 'AES-256-GCM');

    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
};

const restoreVersion = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('editor')
    const { versionNumber } = req.params;

    const targetVersion = await FileVersion.findOne({
      fileId: file._id,
      versionNumber: Number(versionNumber),
    });

    if (!targetVersion) {
      return res.status(404).json({
        success: false,
        error: `Version ${versionNumber} not found.`,
      });
    }

    const nextVersion = (file.currentVersion || 1) + 1;

    // Create a new version that points to the target historical data
    await FileVersion.create({
      fileId: file._id,
      versionNumber: nextVersion,
      s3ObjectKey: targetVersion.s3ObjectKey,
      encryptedSize: targetVersion.encryptedSize,
      mimeType: targetVersion.mimeType,
      iv: targetVersion.iv,
      uploadedBy: req.user._id,
      changeSummary: `Restored from version ${versionNumber}`,
      createdAt: new Date(),
    });

    file.currentVersion = nextVersion;
    file.s3ObjectKey = targetVersion.s3ObjectKey;
    file.encryptedSize = targetVersion.encryptedSize;
    file.iv = targetVersion.iv;
    file.mimeType = targetVersion.mimeType;
    await file.save();

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'edit',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        version: nextVersion,
        restoredFromVersion: Number(versionNumber),
        editorName: req.user.name,
        editorEmail: req.user.email,
        actionDetail: `Restored version v${versionNumber} as new version v${nextVersion}`,
      },
    });

    res.status(200).json({
      success: true,
      message: `Version ${versionNumber} restored as new version v${nextVersion}.`,
      currentVersion: nextVersion,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadFile,
  listFiles,
  getFile,
  downloadFile,
  deleteFile,
  renameFile,
  listVersions,
  createVersion,
  downloadVersion,
  restoreVersion,
};
