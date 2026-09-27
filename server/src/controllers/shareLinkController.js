const crypto = require('crypto');
const FileShareLink = require('../models/FileShareLink');
const File = require('../models/File');
const FilePermission = require('../models/FilePermission');
const storageService = require('../services/storageService');
const auditService = require('../services/auditService');

/**
 * Generate a secure shareable link for a file (Owner only)
 * Supports roles: 'viewer' (view only) or 'editor' (can view, download, and update)
 */
const createShareLink = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const { wrappedFileKey, expiresHours, maxAccessCount, role = 'viewer' } = req.body;

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
    const links = await FileShareLink.find({ fileId: file._id, isRevoked: false })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      links: links.map((l) => ({
        id: l._id,
        token: l.token,
        role: l.role || 'viewer',
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
 * Access file metadata via share link (Public / Recipient)
 */
const accessShareLink = async (req, res, next) => {
  try {
    const { token } = req.params;

    const link = await FileShareLink.findOne({ token, isRevoked: false })
      .populate('fileId')
      .populate('createdBy', 'name email');

    if (!link || !link.fileId || link.fileId.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Share link is invalid, expired, or revoked.' });
    }

    // Check expiration
    if (link.expiresAt && new Date() > link.expiresAt) {
      return res.status(410).json({ success: false, error: 'This share link has expired.' });
    }

    // Check max access count
    if (link.maxAccessCount && link.accessCount >= link.maxAccessCount) {
      return res.status(403).json({ success: false, error: 'This share link has reached its maximum access limit.' });
    }

    // Increment access count
    link.accessCount += 1;
    await link.save();

    res.status(200).json({
      success: true,
      file: {
        id: link.fileId._id,
        originalName: link.fileId.originalName,
        encryptedSize: link.fileId.encryptedSize,
        mimeType: link.fileId.mimeType,
        encryptionAlgorithm: link.fileId.encryptionAlgorithm,
        iv: link.fileId.iv,
        wrappedFileKey: link.wrappedFileKey,
        role: link.role || 'viewer',
        owner: {
          name: link.createdBy.name,
          email: link.createdBy.email,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Download encrypted file stream via share link
 */
const downloadShareLinkFile = async (req, res, next) => {
  try {
    const { token } = req.params;

    const link = await FileShareLink.findOne({ token, isRevoked: false })
      .populate('fileId');

    if (!link || !link.fileId || link.fileId.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Link invalid, expired, or revoked.' });
    }

    if (link.expiresAt && new Date() > link.expiresAt) {
      return res.status(410).json({ success: false, error: 'Share link has expired.' });
    }

    const isPreview = req.query.purpose === 'preview';

    // Viewer restriction: Viewers are not allowed to download the file
    if (link.role === 'viewer' && !isPreview) {
      return res.status(403).json({
        success: false,
        error: 'Downloading is disabled for this document. You have view-only access.',
      });
    }

    const file = link.fileId;
    const fileStream = await storageService.getFileStream(file.s3ObjectKey);

    await auditService.log({
      fileId: file._id,
      actorId: link.createdBy,
      action: isPreview ? 'preview' : 'download',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        accessVia: 'share_link',
        role: link.role,
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

    if (link.role !== 'editor') {
      return res.status(403).json({ success: false, error: 'Access denied. This share link only grants View permissions.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Encrypted file payload is required.' });
    }

    const { iv, originalName } = req.body;
    const file = link.fileId;

    // Save updated encrypted payload to S3 and local vault
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

module.exports = {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  accessShareLink,
  downloadShareLinkFile,
  updateSharedLinkFile,
  rotateKey,
};
