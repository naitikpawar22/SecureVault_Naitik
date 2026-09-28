const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const FileShareLink = require('../models/FileShareLink');
const FolderShareLink = require('../models/FolderShareLink');
const File = require('../models/File');
const Folder = require('../models/Folder');
const FilePermission = require('../models/FilePermission');
const FileVersion = require('../models/FileVersion');
const AccessRequest = require('../models/AccessRequest');
const User = require('../models/User');
const storageService = require('../services/storageService');
const auditService = require('../services/auditService');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper to optionally extract authenticated user and MFA verification status from Bearer token
 */
const getAuthUserOptional = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id);
    if (!user) return null;
    return {
      user,
      mfaVerified: decoded.mfaVerified === true,
    };
  } catch {
    return null;
  }
};

/**
 * Generate a secure shareable link for a file (Owner only)
 */
const createShareLink = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const {
      wrappedFileKey,
      expiresHours,
      maxAccessCount,
      role = 'viewer',
      allowDownload = true,
    } = req.body;

    const token = crypto.randomBytes(32).toString('hex');
    let expiresAt = null;
    if (expiresHours && Number(expiresHours) > 0) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + Number(expiresHours));
    }

    const shareLink = await FileShareLink.create({
      fileId: file._id,
      token,
      createdBy: req.user._id,
      wrappedFileKey: wrappedFileKey || file.encryptedFileKey,
      role: role === 'editor' ? 'editor' : 'viewer',
      allowDownload: Boolean(allowDownload),
      expiresAt,
      maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null,
    });

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'share',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        shareType: 'link',
        role: shareLink.role,
        allowDownload: shareLink.allowDownload,
        tokenId: shareLink._id,
        expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      message: `Secure shareable link created with ${shareLink.role} permissions.`,
      shareLink: {
        id: shareLink._id,
        token: shareLink.token,
        role: shareLink.role,
        allowDownload: shareLink.allowDownload,
        expiresAt: shareLink.expiresAt,
        maxAccessCount: shareLink.maxAccessCount,
        accessCount: shareLink.accessCount,
        createdAt: shareLink.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List all share links for a file (Owner only)
 */
const listShareLinks = async (req, res, next) => {
  try {
    const file = req.fileDoc;
    const links = await FileShareLink.find({ fileId: file._id, isRevoked: false }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      links: links.map((l) => ({
        id: l._id,
        token: l.token,
        role: l.role || 'viewer',
        allowDownload: l.allowDownload !== false,
        isDisabled: Boolean(l.isDisabled),
        expiresAt: l.expiresAt,
        maxAccessCount: l.maxAccessCount,
        accessCount: l.accessCount,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Revoke a share link (Owner only)
 */
const revokeShareLink = async (req, res, next) => {
  try {
    const file = req.fileDoc;
    const { linkId } = req.params;

    const link = await FileShareLink.findOneAndUpdate(
      { _id: linkId, fileId: file._id },
      { isRevoked: true },
      { new: true }
    );

    if (!link) {
      return res.status(404).json({ success: false, error: 'Share link not found.' });
    }

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'revoke',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        shareType: 'link',
        tokenId: link._id,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Share link revoked successfully.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Access file or folder via share link (Public / Recipient)
 * Implements strict workflow from Requirement 1, 2, 3, 5, 6, 9
 */
const accessShareLink = async (req, res, next) => {
  try {
    const { token } = req.params;

    // Check FileShareLink first
    let fileLink = await FileShareLink.findOne({ token, isRevoked: false })
      .populate('fileId')
      .populate('createdBy', 'name email');

    let folderLink = null;
    let targetType = 'file';

    if (!fileLink || !fileLink.fileId || fileLink.fileId.status === 'deleted') {
      folderLink = await FolderShareLink.findOne({ token, isRevoked: false })
        .populate('folderId')
        .populate('createdBy', 'name email');

      if (!folderLink || !folderLink.folderId || folderLink.folderId.status === 'deleted') {
        return res.status(404).json({ success: false, error: 'Share link is invalid, expired, or revoked.' });
      }
      targetType = 'folder';
    }

    const activeLink = fileLink || folderLink;

    // Check if disabled by owner
    if (activeLink.isDisabled) {
      return res.status(403).json({ success: false, error: 'This share link has been disabled by the owner.' });
    }

    // Check expiration
    if (activeLink.expiresAt && new Date() > activeLink.expiresAt) {
      return res.status(410).json({ success: false, error: 'This share link has expired.' });
    }

    // Check max access count
    if (activeLink.maxAccessCount && activeLink.accessCount >= activeLink.maxAccessCount) {
      return res.status(403).json({ success: false, error: 'This share link has reached its maximum access limit.' });
    }

    // Increment access count
    activeLink.accessCount += 1;
    await activeLink.save();

    const authContext = await getAuthUserOptional(req);

    // If visitor is NOT logged in: return login/register requirement and basic preview info
    if (!authContext) {
      if (targetType === 'file') {
        return res.status(200).json({
          success: true,
          requiresAuth: true,
          targetType: 'file',
          link: {
            token: activeLink.token,
            targetType: 'file',
            role: activeLink.role || 'viewer',
            allowDownload: activeLink.allowDownload !== false,
            expiresAt: activeLink.expiresAt,
            name: fileLink.fileId.originalName,
            owner: {
              name: fileLink.createdBy.name,
              email: fileLink.createdBy.email,
            },
          },
          file: {
            id: fileLink.fileId._id,
            originalName: fileLink.fileId.originalName,
            encryptedSize: fileLink.fileId.encryptedSize,
            mimeType: fileLink.fileId.mimeType,
            encryptionAlgorithm: fileLink.fileId.encryptionAlgorithm,
            iv: fileLink.fileId.iv,
            role: activeLink.role || 'viewer',
            owner: {
              name: fileLink.createdBy.name,
              email: fileLink.createdBy.email,
            },
          },
        });
      } else {
        const [unauthFiles, unauthSubfolders] = await Promise.all([
          File.find({ folderId: folderLink.folderId._id, status: 'active' }).select(
            'originalName encryptedSize mimeType iv currentVersion createdAt'
          ),
          Folder.find({ parentId: folderLink.folderId._id, status: 'active' }),
        ]);

        return res.status(200).json({
          success: true,
          requiresAuth: true,
          targetType: 'folder',
          link: {
            token: activeLink.token,
            targetType: 'folder',
            role: activeLink.role || 'viewer',
            allowDownload: activeLink.allowDownload !== false,
            expiresAt: activeLink.expiresAt,
            name: folderLink.folderId.name,
            owner: {
              name: folderLink.createdBy.name,
              email: folderLink.createdBy.email,
            },
          },
          folder: {
            id: folderLink.folderId._id,
            name: folderLink.folderId.name,
            color: folderLink.folderId.color,
            role: activeLink.role || 'viewer',
            allowDownload: activeLink.allowDownload !== false,
            owner: {
              name: folderLink.createdBy.name,
              email: folderLink.createdBy.email,
            },
            files: unauthFiles.map((f) => ({
              id: f._id,
              originalName: f.originalName,
              encryptedSize: f.encryptedSize,
              mimeType: f.mimeType,
              iv: f.iv,
              currentVersion: f.currentVersion || 1,
              createdAt: f.createdAt,
              role: activeLink.role || 'viewer',
              allowDownload: activeLink.allowDownload !== false,
            })),
            subfolders: unauthSubfolders,
          },
        });
      }
    }

    const { user, mfaVerified } = authContext;
    const isOwner = activeLink.createdBy._id.toString() === user._id.toString();

    // Check MFA requirements if not owner
    if (!isOwner) {
      if (!user.mfaEnabled) {
        return res.status(200).json({
          success: true,
          requiresMfaSetup: true,
          message: 'MFA setup is required before submitting an access request.',
          targetType,
          link: {
            token: activeLink.token,
            targetType,
            name: targetType === 'file' ? fileLink.fileId.originalName : folderLink.folderId.name,
            owner: { name: activeLink.createdBy.name },
          },
        });
      }

      if (!mfaVerified) {
        return res.status(200).json({
          success: true,
          requiresMfaVerify: true,
          message: 'MFA verification required for this session.',
          targetType,
          link: {
            token: activeLink.token,
            targetType,
            name: targetType === 'file' ? fileLink.fileId.originalName : folderLink.folderId.name,
            owner: { name: activeLink.createdBy.name },
          },
        });
      }
    }

    // Owner has immediate full access
    if (isOwner) {
      if (targetType === 'file') {
        return res.status(200).json({
          success: true,
          isOwner: true,
          requestStatus: 'approved',
          targetType: 'file',
          file: {
            id: fileLink.fileId._id,
            originalName: fileLink.fileId.originalName,
            encryptedSize: fileLink.fileId.encryptedSize,
            mimeType: fileLink.fileId.mimeType,
            encryptionAlgorithm: fileLink.fileId.encryptionAlgorithm,
            iv: fileLink.fileId.iv,
            wrappedFileKey: fileLink.fileId.encryptedFileKey,
            role: 'owner',
            allowDownload: true,
            currentVersion: fileLink.fileId.currentVersion || 1,
            owner: {
              name: fileLink.createdBy.name,
              email: fileLink.createdBy.email,
            },
          },
        });
      } else {
        const [files, subfolders] = await Promise.all([
          File.find({ folderId: folderLink.folderId._id, status: 'active' }).select(
            'originalName encryptedSize mimeType iv currentVersion createdAt'
          ),
          Folder.find({ parentId: folderLink.folderId._id, status: 'active' }),
        ]);

        return res.status(200).json({
          success: true,
          isOwner: true,
          requestStatus: 'approved',
          targetType: 'folder',
          folder: {
            id: folderLink.folderId._id,
            name: folderLink.folderId.name,
            color: folderLink.folderId.color,
            role: 'owner',
            allowDownload: true,
            owner: {
              name: folderLink.createdBy.name,
              email: folderLink.createdBy.email,
            },
            files,
            subfolders,
          },
        });
      }
    }

    // Visitor is authenticated and MFA-verified. Check AccessRequest status
    const accessRequest = await AccessRequest.findOne({
      linkToken: token,
      requesterId: user._id,
    }).sort({ createdAt: -1 });

    if (!accessRequest) {
      return res.status(200).json({
        success: true,
        requestStatus: 'none',
        canRequest: true,
        targetType,
        link: {
          token: activeLink.token,
          targetType,
          name: targetType === 'file' ? fileLink.fileId.originalName : folderLink.folderId.name,
          role: activeLink.role || 'viewer',
          allowDownload: activeLink.allowDownload !== false,
          owner: {
            name: activeLink.createdBy.name,
            email: activeLink.createdBy.email,
          },
        },
        file: targetType === 'file'
          ? {
              id: fileLink.fileId._id,
              originalName: fileLink.fileId.originalName,
              role: activeLink.role || 'viewer',
              owner: {
                name: fileLink.createdBy.name,
                email: fileLink.createdBy.email,
              },
            }
          : null,
      });
    }

    if (accessRequest.status === 'pending') {
      return res.status(200).json({
        success: true,
        requestStatus: 'pending',
        message: 'Your access request has been sent to the owner. You will be notified when the owner responds.',
        request: accessRequest,
        targetType,
        itemName: targetType === 'file' ? fileLink.fileId.originalName : folderLink.folderId.name,
      });
    }

    if (accessRequest.status === 'rejected') {
      return res.status(403).json({
        success: false,
        requestStatus: 'rejected',
        error: 'Your access request was rejected by the owner.',
        rejectionReason: accessRequest.rejectionReason || '',
      });
    }

    if (accessRequest.status === 'revoked') {
      return res.status(403).json({
        success: false,
        requestStatus: 'revoked',
        error: 'Your access to this item has been revoked.',
      });
    }

    // Access request is 'approved'. Verify active permission
    if (targetType === 'file') {
      const permission = await FilePermission.findOne({
        fileId: fileLink.fileId._id,
        userId: user._id,
        isRevoked: { $ne: true },
      });

      if (!permission) {
        return res.status(403).json({
          success: false,
          requestStatus: 'revoked',
          error: 'Your permission to access this file has been revoked.',
        });
      }

      if (permission.expiresAt && new Date() > permission.expiresAt) {
        return res.status(403).json({
          success: false,
          requestStatus: 'expired',
          error: 'Your access permission has expired.',
        });
      }

      return res.status(200).json({
        success: true,
        requestStatus: 'approved',
        targetType: 'file',
        file: {
          id: fileLink.fileId._id,
          originalName: fileLink.fileId.originalName,
          encryptedSize: fileLink.fileId.encryptedSize,
          mimeType: fileLink.fileId.mimeType,
          encryptionAlgorithm: fileLink.fileId.encryptionAlgorithm,
          iv: fileLink.fileId.iv,
          wrappedFileKey: permission.wrappedFileKey || activeLink.wrappedFileKey,
          role: permission.role || 'viewer',
          allowDownload: permission.allowDownload !== false,
          currentVersion: fileLink.fileId.currentVersion || 1,
          owner: {
            name: fileLink.createdBy.name,
            email: fileLink.createdBy.email,
          },
        },
      });
    } else {
      const folder = await Folder.findOne({
        _id: folderLink.folderId._id,
        status: 'active',
        'sharedWith.userId': user._id,
      });

      if (!folder) {
        return res.status(403).json({
          success: false,
          requestStatus: 'revoked',
          error: 'Your permission to access this folder has been revoked.',
        });
      }

      const sw = folder.sharedWith.find((s) => s.userId.toString() === user._id.toString());
      if (sw && sw.expiresAt && new Date() > sw.expiresAt) {
        return res.status(403).json({
          success: false,
          requestStatus: 'expired',
          error: 'Your access to this folder has expired.',
        });
      }

      // Fetch files in folder that the recipient has permission to access
      const descendantIds = await Folder.find({ parentId: folder._id, status: 'active' }).select('_id');
      const allAccessibleFolderIds = [folder._id, ...descendantIds.map((d) => d._id)];

      const files = await File.find({
        folderId: { $in: allAccessibleFolderIds },
        status: 'active',
      }).select('originalName encryptedSize mimeType iv currentVersion folderId createdAt');

      // Fetch user's wrapped keys for these files
      const permissions = await FilePermission.find({
        fileId: { $in: files.map((f) => f._id) },
        userId: user._id,
        isRevoked: { $ne: true },
      });
      const permMap = new Map(permissions.map((p) => [p.fileId.toString(), p]));

      const filesWithPermissions = files.map((f) => {
        const p = permMap.get(f._id.toString());
        return {
          id: f._id,
          originalName: f.originalName,
          encryptedSize: f.encryptedSize,
          mimeType: f.mimeType,
          iv: f.iv,
          currentVersion: f.currentVersion || 1,
          wrappedFileKey: p?.wrappedFileKey || null,
          role: p?.role || sw?.role || 'viewer',
          allowDownload: p ? p.allowDownload !== false : (sw?.allowDownload !== false),
        };
      });

      const subfolders = await Folder.find({ parentId: folder._id, status: 'active' });

      return res.status(200).json({
        success: true,
        requestStatus: 'approved',
        targetType: 'folder',
        folder: {
          id: folder._id,
          name: folder.name,
          color: folder.color,
          role: sw?.role || 'viewer',
          allowDownload: sw?.allowDownload !== false,
          owner: {
            name: folderLink.createdBy.name,
            email: folderLink.createdBy.email,
          },
          files: filesWithPermissions,
          subfolders,
        },
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Download encrypted file stream via share link (File or Folder)
 */
const downloadShareLinkFile = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { fileId, purpose } = req.query;
    const isPreview = purpose === 'preview';

    let fileLink = await FileShareLink.findOne({ token, isRevoked: false }).populate('fileId');
    let folderLink = null;
    let file = null;
    let activeLink = null;

    if (fileLink && fileLink.fileId && fileLink.fileId.status !== 'deleted') {
      activeLink = fileLink;
      file = fileLink.fileId;
    } else {
      folderLink = await FolderShareLink.findOne({ token, isRevoked: false }).populate('folderId');
      if (!folderLink || !folderLink.folderId || folderLink.folderId.status === 'deleted') {
        return res.status(404).json({ success: false, error: 'Link invalid, expired, or revoked.' });
      }
      activeLink = folderLink;
      if (fileId) {
        file = await File.findOne({ _id: fileId, folderId: folderLink.folderId._id, status: 'active' });
      } else {
        file = await File.findOne({ folderId: folderLink.folderId._id, status: 'active' });
      }
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found in shared folder.' });
      }
    }

    if (activeLink.isDisabled) {
      return res.status(403).json({ success: false, error: 'Share link has been disabled by the owner.' });
    }

    if (activeLink.expiresAt && new Date() > activeLink.expiresAt) {
      return res.status(410).json({ success: false, error: 'Share link has expired.' });
    }

    const authContext = await getAuthUserOptional(req);

    if (!authContext) {
      // Unauthenticated visitor: enforce viewer restriction from link
      if ((activeLink.role === 'viewer' || activeLink.allowDownload === false) && !isPreview) {
        return res.status(403).json({
          success: false,
          error: 'Downloading is disabled for this document. You have view-only access.',
          code: 'DOWNLOAD_BLOCKED',
        });
      }
    } else {
      const { user } = authContext;
      const isOwner = activeLink.createdBy.toString() === user._id.toString();

      if (!isOwner) {
        // Recipient must have an approved access request
        const accessRequest = await AccessRequest.findOne({
          linkToken: token,
          requesterId: user._id,
        }).sort({ createdAt: -1 });

        if (!accessRequest || accessRequest.status !== 'approved') {
          return res.status(403).json({
            success: false,
            error: accessRequest
              ? `Access request is ${accessRequest.status}. File access blocked.`
              : 'Access request is required and must be approved by the owner.',
            code: 'ACCESS_REQUEST_REQUIRED',
          });
        }

        // If fileLink, check FilePermission allowDownload
        if (fileLink) {
          const permission = await FilePermission.findOne({
            fileId: file._id,
            userId: user._id,
            isRevoked: { $ne: true },
          });

          if (!permission) {
            return res.status(403).json({
              success: false,
              error: 'Your permission to access this file has been revoked.',
            });
          }

          if (permission.expiresAt && new Date() > permission.expiresAt) {
            return res.status(403).json({ success: false, error: 'Access permission has expired.' });
          }

          if (permission.allowDownload === false && !isPreview) {
            return res.status(403).json({
              success: false,
              error: 'Downloading is disabled for this document. You have view-only access.',
              code: 'DOWNLOAD_BLOCKED',
            });
          }
        } else if (folderLink) {
          // Check folder permissions
          if (folderLink.allowDownload === false && !isPreview) {
            return res.status(403).json({
              success: false,
              error: 'Downloading is disabled for this folder. You have view-only access.',
              code: 'DOWNLOAD_BLOCKED',
            });
          }
        }
      }
    }

    const fileStream = await storageService.getFileStream(file.s3ObjectKey);

    await auditService.log({
      fileId: file._id,
      folderId: folderLink ? folderLink.folderId._id : (file.folderId || null),
      actorId: authContext?.user?._id || activeLink.createdBy,
      action: isPreview ? 'preview' : 'download',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        accessVia: folderLink ? 'shared_folder_link' : 'share_link',
        role: activeLink.role,
        purpose: isPreview ? 'preview' : 'download',
      },
    });

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

/**
 * Update file via share link (Editor role required)
 */
const updateSharedLinkFile = async (req, res, next) => {
  try {
    const { token } = req.params;
    const link = await FileShareLink.findOne({ token, isRevoked: false }).populate('fileId');

    if (!link || !link.fileId || link.fileId.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Share link invalid or revoked.' });
    }

    if (link.isDisabled) {
      return res.status(403).json({ success: false, error: 'Share link has been disabled.' });
    }

    if (link.role !== 'editor') {
      return res.status(403).json({ success: false, error: 'Access denied. This share link only grants View permissions.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Encrypted file payload is required.' });
    }

    const { iv, originalName } = req.body;
    const file = link.fileId;

    await storageService.uploadFile(file.s3ObjectKey, req.file.path, file.mimeType);
    const fs = require('fs');
    fs.unlink(req.file.path, () => {});

    file.encryptedSize = req.file.size;
    if (iv) file.iv = iv;
    if (originalName) file.originalName = originalName.trim();
    await file.save();

    await auditService.log({
      fileId: file._id,
      actorId: link.createdBy,
      action: 'upload',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        accessVia: 'share_link_editor',
      },
    });

    res.status(200).json({
      success: true,
      message: 'File updated successfully by editor.',
      file: {
        id: file._id,
        originalName: file.originalName,
        encryptedSize: file.encryptedSize,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Key Rotation / Re-encryption on Revocation (Owner only)
 */
const rotateKey = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified owner
    const { newWrappedFileKey, newIv, reEncryptedFile } = req.body;

    if (!newWrappedFileKey || !newIv) {
      return res.status(400).json({ success: false, error: 'New wrapped key and IV are required for key rotation.' });
    }

    file.encryptedFileKey = typeof newWrappedFileKey === 'string' ? JSON.parse(newWrappedFileKey) : newWrappedFileKey;
    file.iv = newIv;

    if (req.file) {
      await storageService.uploadFile(file.s3ObjectKey, req.file.path, file.mimeType);
      const fs = require('fs');
      fs.unlink(req.file.path, () => {});
      file.encryptedSize = req.file.size;
    }

    await file.save();

    // Invalidate all prior share links
    await FileShareLink.updateMany({ fileId: file._id }, { isRevoked: true });

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'security_alert',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        event: 'key_rotation',
        originalName: file.originalName,
        message: 'File key rotated and re-encrypted after access revocation.',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Key rotated and re-encrypted successfully. All prior access keys invalidated.',
      file: {
        id: file._id,
        originalName: file.originalName,
        encryptedSize: file.encryptedSize,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Upload a file into a shared folder via folder share link (Editor role required)
 */
const uploadSharedFolderFile = async (req, res, next) => {
  try {
    const { token } = req.params;
    const folderLink = await FolderShareLink.findOne({ token, isRevoked: false })
      .populate('folderId')
      .populate('createdBy', 'name email');

    if (!folderLink || !folderLink.folderId || folderLink.folderId.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Shared folder link is invalid or revoked.' });
    }

    if (folderLink.isDisabled) {
      return res.status(403).json({ success: false, error: 'This share link has been disabled by the owner.' });
    }

    if (folderLink.expiresAt && new Date() > folderLink.expiresAt) {
      return res.status(410).json({ success: false, error: 'This share link has expired.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Encrypted file payload is required.' });
    }

    const authContext = await getAuthUserOptional(req);
    const isOwner = authContext?.user?._id && folderLink.createdBy._id.toString() === authContext.user._id.toString();
    const canUpload = isOwner || folderLink.role === 'editor';

    if (!canUpload) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only editors can upload files to this shared folder.',
      });
    }

    const { originalName, mimeType, encryptedFileKey, iv, searchTokens } = req.body;
    const tempFilePath = req.file.path;
    const encryptedSize = req.file.size;
    const s3ObjectKey = `vault-${uuidv4()}-${Date.now()}.bin`;

    await storageService.uploadFile(s3ObjectKey, tempFilePath, mimeType || 'application/octet-stream');
    const fs = require('fs');
    fs.unlink(tempFilePath, () => {});

    let parsedFileKey = encryptedFileKey;
    if (typeof encryptedFileKey === 'string') {
      try {
        parsedFileKey = JSON.parse(encryptedFileKey);
      } catch {
        parsedFileKey = encryptedFileKey;
      }
    }

    let parsedTokens = [];
    if (searchTokens) {
      if (Array.isArray(searchTokens)) {
        parsedTokens = searchTokens;
      } else if (typeof searchTokens === 'string') {
        try {
          parsedTokens = JSON.parse(searchTokens);
        } catch {
          parsedTokens = searchTokens.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
    }

    const uploaderId = authContext?.user?._id || folderLink.createdBy._id;

    const file = await File.create({
      originalName: (originalName || req.file.originalname || 'Untitled File').trim(),
      ownerId: uploaderId,
      folderId: folderLink.folderId._id,
      s3ObjectKey,
      encryptedSize,
      mimeType: mimeType || 'application/octet-stream',
      encryptedFileKey: parsedFileKey,
      encryptionAlgorithm: 'AES-256-GCM',
      iv,
      status: 'active',
      currentVersion: 1,
      searchTokens: parsedTokens,
    });

    // If uploaded by someone other than the folder owner, grant folder owner access
    if (folderLink.folderId.ownerId && !folderLink.folderId.ownerId.equals(uploaderId)) {
      await FilePermission.findOneAndUpdate(
        { fileId: file._id, userId: folderLink.folderId.ownerId },
        {
          role: 'owner',
          wrappedFileKey: parsedFileKey,
          grantedBy: uploaderId,
          allowDownload: true,
          createdAt: new Date(),
        },
        { upsert: true }
      );
    }

    await FileVersion.create({
      fileId: file._id,
      versionNumber: 1,
      s3ObjectKey,
      encryptedSize,
      mimeType: file.mimeType,
      iv: file.iv,
      uploadedBy: uploaderId,
      changeSummary: 'Uploaded via shared folder link',
      createdAt: file.createdAt,
    });

    await auditService.log({
      fileId: file._id,
      folderId: folderLink.folderId._id,
      actorId: uploaderId,
      action: 'upload',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        folderId: folderLink.folderId._id,
        folderName: folderLink.folderId.name,
        accessVia: 'shared_folder_link',
      },
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded to shared folder successfully.',
      file: {
        id: file._id,
        originalName: file.originalName,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        iv: file.iv,
        currentVersion: file.currentVersion,
        folderId: file.folderId,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a file in a shared folder via folder share link (Editor role required)
 */
const deleteSharedFolderFile = async (req, res, next) => {
  try {
    const { token, fileId } = req.params;
    const folderLink = await FolderShareLink.findOne({ token, isRevoked: false })
      .populate('folderId')
      .populate('createdBy', 'name email');

    if (!folderLink || !folderLink.folderId || folderLink.folderId.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Shared folder link is invalid or revoked.' });
    }

    if (folderLink.isDisabled) {
      return res.status(403).json({ success: false, error: 'This share link has been disabled by the owner.' });
    }

    if (folderLink.expiresAt && new Date() > folderLink.expiresAt) {
      return res.status(410).json({ success: false, error: 'This share link has expired.' });
    }

    const authContext = await getAuthUserOptional(req);
    const isOwner = authContext?.user?._id && folderLink.createdBy._id.toString() === authContext.user._id.toString();
    const canDelete = isOwner || folderLink.role === 'editor';

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Editor role required to delete files from this shared folder.',
      });
    }

    const file = await File.findOne({
      _id: fileId,
      folderId: folderLink.folderId._id,
      status: 'active',
    });

    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found in this shared folder.' });
    }

    file.status = 'deleted';
    await file.save();

    await storageService.deleteFile(file.s3ObjectKey);

    const actorId = authContext?.user?._id || folderLink.createdBy._id;

    await auditService.log({
      fileId: file._id,
      folderId: folderLink.folderId._id,
      actorId,
      action: 'delete',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        folderId: folderLink.folderId._id,
        folderName: folderLink.folderId.name,
        accessVia: 'shared_folder_link',
        actionDetail: `Deleted file "${file.originalName}" from shared folder "${folderLink.folderId.name}"`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'File deleted from shared folder successfully.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  accessShareLink,
  downloadShareLinkFile,
  updateSharedLinkFile,
  uploadSharedFolderFile,
  deleteSharedFolderFile,
  rotateKey,
};
