const File = require('../models/File');
const Folder = require('../models/Folder');
const FilePermission = require('../models/FilePermission');
const FileShareLink = require('../models/FileShareLink');
const FolderShareLink = require('../models/FolderShareLink');
const AccessRequest = require('../models/AccessRequest');
const FileVersion = require('../models/FileVersion');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const auditService = require('../services/auditService');

/**
 * Get comprehensive access management details for a file (Owner only)
 */
const getFileAccessManagement = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')

    const [permissions, pendingRequests, shareLinks, versions, auditLogs] = await Promise.all([
      FilePermission.find({ fileId: file._id, isRevoked: { $ne: true } })
        .populate('userId', 'name email avatar')
        .populate('grantedBy', 'name email')
        .sort({ createdAt: -1 }),
      AccessRequest.find({ fileId: file._id, status: 'pending' })
        .populate('requesterId', 'name email avatar publicKey')
        .sort({ createdAt: -1 }),
      FileShareLink.find({ fileId: file._id, isRevoked: false })
        .sort({ createdAt: -1 }),
      FileVersion.find({ fileId: file._id })
        .populate('uploadedBy', 'name email avatar')
        .sort({ versionNumber: -1 }),
      AuditLog.find({ fileId: file._id })
        .populate('actorId', 'name email avatar')
        .sort({ timestamp: -1 })
        .limit(30),
    ]);

    res.status(200).json({
      success: true,
      file: {
        id: file._id,
        originalName: file.originalName,
        currentVersion: file.currentVersion || 1,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
      },
      approvedRecipients: permissions.map((p) => ({
        id: p._id,
        userId: p.userId?._id,
        name: p.userId?.name,
        email: p.userId?.email,
        avatar: p.userId?.avatar,
        role: p.role,
        allowDownload: p.allowDownload !== false,
        expiresAt: p.expiresAt,
        grantedBy: p.grantedBy?.name,
        createdAt: p.createdAt,
      })),
      pendingRequests: pendingRequests.map((r) => ({
        id: r._id,
        linkToken: r.linkToken,
        requester: {
          id: r.requesterId?._id,
          name: r.requesterId?.name,
          email: r.requesterId?.email,
          avatar: r.requesterId?.avatar,
          publicKey: r.requesterId?.publicKey,
        },
        requestedRole: r.requestedRole,
        message: r.message,
        requestDate: r.requestDate || r.createdAt,
      })),
      shareLinks: shareLinks.map((l) => ({
        id: l._id,
        token: l.token,
        role: l.role,
        allowDownload: l.allowDownload !== false,
        isDisabled: Boolean(l.isDisabled),
        expiresAt: l.expiresAt,
        accessCount: l.accessCount,
        maxAccessCount: l.maxAccessCount,
        createdAt: l.createdAt,
      })),
      versions: versions.map((v) => ({
        id: v._id,
        versionNumber: v.versionNumber,
        encryptedSize: v.encryptedSize,
        uploadedBy: v.uploadedBy
          ? { id: v.uploadedBy._id, name: v.uploadedBy.name, email: v.uploadedBy.email }
          : { name: 'Owner' },
        changeSummary: v.changeSummary,
        createdAt: v.createdAt,
        isCurrent: v.versionNumber === (file.currentVersion || 1),
      })),
      auditLogs: auditLogs.map((a) => ({
        id: a._id,
        action: a.action,
        timestamp: a.timestamp,
        actor: a.actorId ? { name: a.actorId.name, email: a.actorId.email } : { name: 'System' },
        metadata: a.metadata,
        ipAddress: a.ipAddress,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update recipient's permission settings (Role, Download block, Expiration)
 */
const updateFileRecipientPermission = async (req, res, next) => {
  try {
    const file = req.fileDoc;
    const { userId } = req.params;
    const { role, allowDownload, expiresAt } = req.body;

    const permission = await FilePermission.findOne({
      fileId: file._id,
      userId,
      isRevoked: { $ne: true },
    }).populate('userId', 'name email');

    if (!permission) {
      return res.status(404).json({ success: false, error: 'Recipient permission record not found.' });
    }

    if (role && (role === 'viewer' || role === 'editor')) {
      permission.role = role;
    }
    if (typeof allowDownload === 'boolean') {
      permission.allowDownload = allowDownload;
    }
    if (expiresAt !== undefined) {
      permission.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    await permission.save();

    // Keep AccessRequest in sync
    const arUpdate = {};
    if (role) arUpdate.grantedRole = role;
    if (typeof allowDownload === 'boolean') arUpdate.allowDownload = allowDownload;
    if (expiresAt !== undefined) arUpdate.expiresAt = expiresAt ? new Date(expiresAt) : null;
    await AccessRequest.updateMany({ fileId: file._id, requesterId: userId }, { $set: arUpdate });

    // Notify recipient of permission change
    await Notification.create({
      userId,
      type: 'permission_changed',
      title: 'Permissions Updated',
      message: `Your permissions for "${file.originalName}" have been updated to ${permission.role} (${permission.allowDownload ? 'download enabled' : 'download blocked'}).`,
      fileId: file._id,
    });

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'permission_changed',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        recipientId: userId,
        recipientEmail: permission.userId?.email,
        role: permission.role,
        allowDownload: permission.allowDownload,
        expiresAt: permission.expiresAt,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Permission updated successfully.',
      permission: {
        id: permission._id,
        userId: permission.userId?._id,
        role: permission.role,
        allowDownload: permission.allowDownload,
        expiresAt: permission.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Revoke recipient access immediately (Owner only)
 */
const revokeFileRecipient = async (req, res, next) => {
  try {
    const file = req.fileDoc;
    const { userId } = req.params;

    const permission = await FilePermission.findOne({ fileId: file._id, userId });
    if (!permission) {
      return res.status(404).json({ success: false, error: 'Permission not found.' });
    }

    // Mark as revoked and delete
    await FilePermission.deleteOne({ _id: permission._id });

    // Update any AccessRequest records
    await AccessRequest.updateMany(
      { fileId: file._id, requesterId: userId, status: 'approved' },
      { status: 'revoked' }
    );

    // Notify recipient
    await Notification.create({
      userId,
      type: 'access_revoked',
      title: 'Access Revoked',
      message: `Your access to "${file.originalName}" has been revoked by the owner.`,
      fileId: file._id,
    });

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'revoke',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        recipientId: userId,
        note: 'Access revoked. Future access, previews, and key retrievals blocked.',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Recipient access revoked successfully. Future access and downloads are blocked.',
      warning: 'Note: Revocation prevents future access but cannot delete copies or keys previously downloaded by the recipient.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update share link settings (disable, expire, change role)
 */
const updateFileShareLink = async (req, res, next) => {
  try {
    const file = req.fileDoc;
    const { linkId } = req.params;
    const { isDisabled, expiresAt, role, allowDownload } = req.body;

    const link = await FileShareLink.findOne({ _id: linkId, fileId: file._id });
    if (!link) {
      return res.status(404).json({ success: false, error: 'Share link not found.' });
    }

    if (typeof isDisabled === 'boolean') link.isDisabled = isDisabled;
    if (expiresAt !== undefined) link.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (role && (role === 'viewer' || role === 'editor')) link.role = role;
    if (typeof allowDownload === 'boolean') link.allowDownload = allowDownload;

    await link.save();

    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'share_link_updated',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        linkId: link._id,
        isDisabled: link.isDisabled,
        expiresAt: link.expiresAt,
        role: link.role,
        allowDownload: link.allowDownload,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Share link settings updated.',
      link,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get access management details for a folder (Owner only)
 */
const getFolderAccessManagement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' })
      .populate('sharedWith.userId', 'name email avatar')
      .populate('sharedWith.grantedBy', 'name email');

    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found or you are not the owner.' });
    }

    const [pendingRequests, shareLinks, auditLogs, files] = await Promise.all([
      AccessRequest.find({ folderId: folder._id, status: 'pending' })
        .populate('requesterId', 'name email avatar publicKey')
        .sort({ createdAt: -1 }),
      FolderShareLink.find({ folderId: folder._id, isRevoked: false })
        .sort({ createdAt: -1 }),
      AuditLog.find({ folderId: folder._id })
        .populate('actorId', 'name email avatar')
        .sort({ timestamp: -1 })
        .limit(30),
      File.find({ folderId: folder._id, status: 'active' }).select('originalName encryptedSize currentVersion mimeType'),
    ]);

    res.status(200).json({
      success: true,
      folder: {
        id: folder._id,
        name: folder.name,
        color: folder.color,
        createdAt: folder.createdAt,
      },
      files: files.map((f) => ({
        id: f._id,
        originalName: f.originalName,
        encryptedSize: f.encryptedSize,
        currentVersion: f.currentVersion || 1,
      })),
      approvedRecipients: (folder.sharedWith || []).map((sw) => ({
        userId: sw.userId?._id,
        name: sw.userId?.name,
        email: sw.userId?.email,
        avatar: sw.userId?.avatar,
        role: sw.role,
        allowDownload: sw.allowDownload !== false,
        expiresAt: sw.expiresAt,
        grantedBy: sw.grantedBy?.name,
        createdAt: sw.createdAt,
      })),
      pendingRequests: pendingRequests.map((r) => ({
        id: r._id,
        linkToken: r.linkToken,
        requester: {
          id: r.requesterId?._id,
          name: r.requesterId?.name,
          email: r.requesterId?.email,
          avatar: r.requesterId?.avatar,
          publicKey: r.requesterId?.publicKey,
        },
        requestedRole: r.requestedRole,
        message: r.message,
        requestDate: r.requestDate || r.createdAt,
      })),
      shareLinks: shareLinks.map((l) => ({
        id: l._id,
        token: l.token,
        role: l.role,
        allowDownload: l.allowDownload !== false,
        isDisabled: Boolean(l.isDisabled),
        expiresAt: l.expiresAt,
        accessCount: l.accessCount,
        maxAccessCount: l.maxAccessCount,
        createdAt: l.createdAt,
      })),
      auditLogs: auditLogs.map((a) => ({
        id: a._id,
        action: a.action,
        timestamp: a.timestamp,
        actor: a.actorId ? { name: a.actorId.name, email: a.actorId.email } : { name: 'System' },
        metadata: a.metadata,
        ipAddress: a.ipAddress,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update folder recipient permission
 */
const updateFolderRecipientPermission = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const { role, allowDownload, expiresAt } = req.body;

    const folder = await Folder.findOne({ _id: id, ownerId: req.user._id, status: 'active' });
    if (!folder) {
      return res.status(404).json({ success: false, error: 'Folder not found.' });
    }

    const swIndex = folder.sharedWith.findIndex((sw) => sw.userId.toString() === userId);
    if (swIndex === -1) {
      return res.status(404).json({ success: false, error: 'Recipient not found in folder permissions.' });
    }

    if (role && (role === 'viewer' || role === 'editor')) {
      folder.sharedWith[swIndex].role = role;
    }
    if (typeof allowDownload === 'boolean') {
      folder.sharedWith[swIndex].allowDownload = allowDownload;
    }
    if (expiresAt !== undefined) {
      folder.sharedWith[swIndex].expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    await folder.save();

    // Also update any child files for this user
    const files = await File.find({ folderId: folder._id, status: 'active' });
    if (files.length > 0) {
      const fileIds = files.map((f) => f._id);
      const updateData = {};
      if (role) updateData.role = role;
      if (typeof allowDownload === 'boolean') updateData.allowDownload = allowDownload;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

      await FilePermission.updateMany({ fileId: { $in: fileIds }, userId }, { $set: updateData });

      // Upsert wrappedFileKeys if provided
      const { wrappedFileKeys } = req.body;
      if (Array.isArray(wrappedFileKeys) && wrappedFileKeys.length > 0) {
        for (const item of wrappedFileKeys) {
          if (item.fileId && item.wrappedFileKey) {
            let key = item.wrappedFileKey;
            if (typeof key === 'string') {
              try { key = JSON.parse(key); } catch {}
            }
            await FilePermission.findOneAndUpdate(
              { fileId: item.fileId, userId },
              {
                role: role || folder.sharedWith[swIndex].role,
                wrappedFileKey: key,
                grantedBy: req.user._id,
                allowDownload: folder.sharedWith[swIndex].allowDownload,
                expiresAt: folder.sharedWith[swIndex].expiresAt,
                isRevoked: false,
              },
              { upsert: true, new: true }
            );
          }
        }
      }
    }

    // Keep AccessRequest in sync
    const arUpdate = {};
    if (role) arUpdate.grantedRole = role;
    if (typeof allowDownload === 'boolean') arUpdate.allowDownload = allowDownload;
    if (expiresAt !== undefined) arUpdate.expiresAt = expiresAt ? new Date(expiresAt) : null;
    await AccessRequest.updateMany({ folderId: folder._id, requesterId: userId }, { $set: arUpdate });

    await auditService.log({
      folderId: folder._id,
      actorId: req.user._id,
      action: 'permission_changed',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        folderName: folder.name,
        recipientId: userId,
        role: folder.sharedWith[swIndex].role,
        allowDownload: folder.sharedWith[swIndex].allowDownload,
        expiresAt: folder.sharedWith[swIndex].expiresAt,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Folder permission updated successfully.',
      sharedWith: folder.sharedWith[swIndex],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update folder share link
 */
const updateFolderShareLink = async (req, res, next) => {
  try {
    const { id, linkId } = req.params;
    const { isDisabled, expiresAt, role, allowDownload } = req.body;

    const link = await FolderShareLink.findOne({ _id: linkId, folderId: id, createdBy: req.user._id });
    if (!link) {
      return res.status(404).json({ success: false, error: 'Folder share link not found.' });
    }

    if (typeof isDisabled === 'boolean') link.isDisabled = isDisabled;
    if (expiresAt !== undefined) link.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (role && (role === 'viewer' || role === 'editor')) link.role = role;
    if (typeof allowDownload === 'boolean') link.allowDownload = allowDownload;

    await link.save();

    res.status(200).json({
      success: true,
      message: 'Folder share link updated.',
      link,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getFileAccessManagement,
  updateFileRecipientPermission,
  revokeFileRecipient,
  updateFileShareLink,
  getFolderAccessManagement,
  updateFolderRecipientPermission,
  updateFolderShareLink,
};
