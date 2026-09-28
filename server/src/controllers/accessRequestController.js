const AccessRequest = require('../models/AccessRequest');
const FileShareLink = require('../models/FileShareLink');
const FolderShareLink = require('../models/FolderShareLink');
const File = require('../models/File');
const Folder = require('../models/Folder');
const FilePermission = require('../models/FilePermission');
const Notification = require('../models/Notification');
const User = require('../models/User');
const auditService = require('../services/auditService');

/**
 * Helper to fetch all descendant folder IDs
 */
const getAllDescendantFolderIds = async (folderId) => {
  const descendantIds = [];
  let currentParentIds = [folderId];
  while (currentParentIds.length > 0) {
    const children = await Folder.find(
      { parentId: { $in: currentParentIds }, status: 'active' },
      '_id'
    );
    if (children.length === 0) break;
    const childIds = children.map((c) => c._id);
    descendantIds.push(...childIds);
    currentParentIds = childIds;
  }
  return descendantIds;
};

/**
 * Create an access request for a share link (Recipient)
 */
const createAccessRequest = async (req, res, next) => {
  try {
    const { token, requestedRole = 'viewer', message = '' } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Link token is required.' });
    }

    // Require MFA verification before submitting request (Requirement 2 & 3)
    if (!req.user.mfaEnabled) {
      return res.status(403).json({
        success: false,
        code: 'MFA_SETUP_REQUIRED',
        error: 'MFA setup is required before submitting an access request.',
      });
    }

    if (!req.user.mfaVerified) {
      return res.status(403).json({
        success: false,
        code: 'MFA_VERIFICATION_REQUIRED',
        error: 'Please verify your MFA code before requesting access.',
      });
    }

    // Lookup link in FileShareLink or FolderShareLink
    let fileLink = await FileShareLink.findOne({ token, isRevoked: false }).populate('fileId');
    let folderLink = null;
    let targetType = 'file';
    let targetId = null;
    let ownerId = null;
    let itemName = '';

    if (fileLink && fileLink.fileId && fileLink.fileId.status !== 'deleted') {
      targetType = 'file';
      targetId = fileLink.fileId._id;
      ownerId = fileLink.createdBy;
      itemName = fileLink.fileId.originalName;

      if (fileLink.isDisabled) {
        return res.status(403).json({ success: false, error: 'This share link has been disabled by the owner.' });
      }
      if (fileLink.expiresAt && new Date() > fileLink.expiresAt) {
        return res.status(410).json({ success: false, error: 'This share link has expired.' });
      }
    } else {
      folderLink = await FolderShareLink.findOne({ token, isRevoked: false }).populate('folderId');
      if (folderLink && folderLink.folderId && folderLink.folderId.status !== 'deleted') {
        targetType = 'folder';
        targetId = folderLink.folderId._id;
        ownerId = folderLink.createdBy;
        itemName = folderLink.folderId.name;

        if (folderLink.isDisabled) {
          return res.status(403).json({ success: false, error: 'This folder share link has been disabled by the owner.' });
        }
        if (folderLink.expiresAt && new Date() > folderLink.expiresAt) {
          return res.status(410).json({ success: false, error: 'This folder share link has expired.' });
        }
      } else {
        return res.status(404).json({ success: false, error: 'Share link is invalid, expired, or revoked.' });
      }
    }

    // Owner cannot request access to their own files/folders
    if (ownerId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'You are the owner of this item and do not need to request access.',
      });
    }

    // Check if user already has an active permission
    if (targetType === 'file') {
      const existingPerm = await FilePermission.findOne({
        fileId: targetId,
        userId: req.user._id,
        isRevoked: { $ne: true },
      });
      if (existingPerm && (!existingPerm.expiresAt || new Date() <= existingPerm.expiresAt)) {
        return res.status(200).json({
          success: true,
          alreadyApproved: true,
          message: 'You already have approved access to this file.',
        });
      }
    } else {
      const folderDoc = await Folder.findById(targetId);
      const isAlreadyShared = folderDoc?.sharedWith?.some(
        (sw) => sw.userId.toString() === req.user._id.toString() && (!sw.expiresAt || new Date() <= sw.expiresAt)
      );
      if (isAlreadyShared) {
        return res.status(200).json({
          success: true,
          alreadyApproved: true,
          message: 'You already have approved access to this folder.',
        });
      }
    }

    // Prevent duplicate pending requests from the same account for the same link
    const existingPending = await AccessRequest.findOne({
      linkToken: token,
      requesterId: req.user._id,
      status: 'pending',
    });

    if (existingPending) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending access request for this link.',
        message: 'Your access request has been sent to the owner. You will be notified when the owner responds.',
        request: existingPending,
      });
    }

    const accessRequest = await AccessRequest.create({
      linkId: fileLink ? fileLink._id : folderLink._id,
      linkToken: token,
      targetType,
      fileId: targetType === 'file' ? targetId : null,
      folderId: targetType === 'folder' ? targetId : null,
      requesterId: req.user._id,
      ownerId,
      requestedRole: requestedRole === 'editor' ? 'editor' : 'viewer',
      status: 'pending',
      message: message.trim(),
      requestDate: new Date(),
    });

    // Notify the file/folder owner (Requirement 4)
    await Notification.create({
      userId: ownerId,
      type: 'access_request',
      title: 'New Access Request',
      message: `${req.user.name} (${req.user.email}) requested ${accessRequest.requestedRole} access to "${itemName}".`,
      linkToken: token,
      fileId: targetType === 'file' ? targetId : null,
      folderId: targetType === 'folder' ? targetId : null,
      accessRequestId: accessRequest._id,
    });

    // Audit logging
    await auditService.log({
      fileId: targetType === 'file' ? targetId : null,
      folderId: targetType === 'folder' ? targetId : null,
      actorId: req.user._id,
      action: 'access_request_created',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        targetType,
        itemName,
        linkToken: token,
        requestedRole: accessRequest.requestedRole,
        ownerId,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Your access request has been sent to the owner. You will be notified when the owner responds.',
      request: accessRequest,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Check status of requester's access request for a link token
 */
const getRequestStatusForToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    const request = await AccessRequest.findOne({
      linkToken: token,
      requesterId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate('fileId', 'originalName encryptedSize mimeType')
      .populate('folderId', 'name color');

    if (!request) {
      return res.status(200).json({
        success: true,
        hasRequest: false,
        status: 'none',
      });
    }

    res.status(200).json({
      success: true,
      hasRequest: true,
      status: request.status,
      request,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List all access requests for the owner (Requirement 4)
 */
const listOwnerRequests = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { ownerId: req.user._id };
    if (status) {
      query.status = status;
    }

    const requests = await AccessRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('requesterId', 'name email avatar publicKey')
      .populate('fileId', 'originalName encryptedSize mimeType currentVersion encryptedFileKey iv')
      .populate('folderId', 'name color s3Prefix');

    const formatted = requests.map((r) => {
      const itemName = r.targetType === 'file' ? r.fileId?.originalName : r.folderId?.name;
      return {
        id: r._id,
        linkToken: r.linkToken,
        targetType: r.targetType,
        targetId: r.targetType === 'file' ? r.fileId?._id : r.folderId?._id,
        itemName: itemName || 'Unknown Item',
        file: r.fileId,
        folder: r.folderId,
        requester: {
          id: r.requesterId?._id,
          name: r.requesterId?.name || 'Unknown',
          email: r.requesterId?.email || '',
          avatar: r.requesterId?.avatar || '',
          publicKey: r.requesterId?.publicKey || null,
        },
        requestedRole: r.requestedRole,
        grantedRole: r.grantedRole,
        allowDownload: r.allowDownload,
        expiresAt: r.expiresAt,
        status: r.status,
        message: r.message,
        rejectionReason: r.rejectionReason,
        requestDate: r.requestDate || r.createdAt,
        respondedAt: r.respondedAt,
      };
    });

    res.status(200).json({
      success: true,
      requests: formatted,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Owner Approves an Access Request (Requirement 5)
 */
const approveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      role = 'viewer',
      allowDownload = true,
      expiresAt = null,
      wrappedFileKey,
      wrappedFileKeys = [],
    } = req.body;

    const request = await AccessRequest.findById(id)
      .populate('fileId')
      .populate('folderId')
      .populate('requesterId', 'name email');

    if (!request) {
      return res.status(404).json({ success: false, error: 'Access request not found.' });
    }

    // Ensure only actual owner or admin can approve (Requirement 4)
    if (request.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied. Only the owner can approve this request.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Request has already been processed with status: ${request.status}`,
      });
    }

    const finalRole = role === 'editor' ? 'editor' : 'viewer';
    const finalDownload = Boolean(allowDownload);
    const finalExpiresAt = expiresAt ? new Date(expiresAt) : null;

    let itemName = '';

    // Create or update permission record for recipient
    if (request.targetType === 'file' && request.fileId) {
      const file = request.fileId;
      itemName = file.originalName;

      // Handle wrappedFileKey: use provided wrapped key or fallback to file's wrapped key
      let parsedKey = wrappedFileKey || file.encryptedFileKey;
      if (typeof wrappedFileKey === 'string') {
        try {
          parsedKey = JSON.parse(wrappedFileKey);
        } catch {
          parsedKey = wrappedFileKey;
        }
      }

      await FilePermission.findOneAndUpdate(
        { fileId: file._id, userId: request.requesterId._id },
        {
          role: finalRole,
          wrappedFileKey: parsedKey,
          grantedBy: req.user._id,
          allowDownload: finalDownload,
          expiresAt: finalExpiresAt,
          isRevoked: false,
          createdAt: new Date(),
        },
        { upsert: true, new: true }
      );
    } else if (request.targetType === 'folder' && request.folderId) {
      const folder = request.folderId;
      itemName = folder.name;

      // Update folder sharedWith entry
      const existingIdx = folder.sharedWith.findIndex(
        (sw) => sw.userId.toString() === request.requesterId._id.toString()
      );
      if (existingIdx >= 0) {
        folder.sharedWith[existingIdx].role = finalRole;
        folder.sharedWith[existingIdx].allowDownload = finalDownload;
        folder.sharedWith[existingIdx].expiresAt = finalExpiresAt;
      } else {
        folder.sharedWith.push({
          userId: request.requesterId._id,
          role: finalRole,
          allowDownload: finalDownload,
          expiresAt: finalExpiresAt,
          grantedBy: req.user._id,
          createdAt: new Date(),
        });
      }
      await folder.save();

      // Cascade wrapped file keys to files inside folder
      if (Array.isArray(wrappedFileKeys) && wrappedFileKeys.length > 0) {
        for (const item of wrappedFileKeys) {
          if (item.fileId && item.wrappedFileKey) {
            await FilePermission.findOneAndUpdate(
              { fileId: item.fileId, userId: request.requesterId._id },
              {
                role: finalRole,
                wrappedFileKey: item.wrappedFileKey,
                grantedBy: req.user._id,
                allowDownload: finalDownload,
                expiresAt: finalExpiresAt,
                isRevoked: false,
                createdAt: new Date(),
              },
              { upsert: true, new: true }
            );
          }
        }
      }

      // Cascade folder permissions to descendant subfolders
      const descendantIds = await getAllDescendantFolderIds(folder._id);
      if (descendantIds.length > 0) {
        const subfolders = await Folder.find({ _id: { $in: descendantIds }, status: 'active' });
        for (const sub of subfolders) {
          const subIdx = sub.sharedWith.findIndex(
            (sw) => sw.userId.toString() === request.requesterId._id.toString()
          );
          if (subIdx >= 0) {
            sub.sharedWith[subIdx].role = finalRole;
            sub.sharedWith[subIdx].allowDownload = finalDownload;
            sub.sharedWith[subIdx].expiresAt = finalExpiresAt;
          } else {
            sub.sharedWith.push({
              userId: request.requesterId._id,
              role: finalRole,
              allowDownload: finalDownload,
              expiresAt: finalExpiresAt,
              grantedBy: req.user._id,
            });
          }
          await sub.save();
        }
      }
    }

    // Update AccessRequest status to approved
    request.status = 'approved';
    request.grantedRole = finalRole;
    request.allowDownload = finalDownload;
    request.expiresAt = finalExpiresAt;
    request.respondedAt = new Date();
    await request.save();

    // Notify the recipient (Requirement 5)
    await Notification.create({
      userId: request.requesterId._id,
      type: 'request_approved',
      title: 'Access Request Approved',
      message: `Your access request for "${itemName}" has been approved (${finalRole}, ${finalDownload ? 'downloads enabled' : 'downloads blocked'}).`,
      linkToken: request.linkToken,
      fileId: request.targetType === 'file' ? request.fileId?._id : null,
      folderId: request.targetType === 'folder' ? request.folderId?._id : null,
      accessRequestId: request._id,
    });

    // Immutable audit log
    await auditService.log({
      fileId: request.targetType === 'file' ? request.fileId?._id : null,
      folderId: request.targetType === 'folder' ? request.folderId?._id : null,
      actorId: req.user._id,
      action: 'access_request_approved',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        requestId: request._id,
        recipientId: request.requesterId._id,
        recipientEmail: request.requesterId.email,
        role: finalRole,
        allowDownload: finalDownload,
        expiresAt: finalExpiresAt,
        itemName,
      },
    });

    res.status(200).json({
      success: true,
      message: `Access approved for ${request.requesterId.email}.`,
      request,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Owner Rejects an Access Request (Requirement 5)
 */
const rejectRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    const request = await AccessRequest.findById(id)
      .populate('fileId')
      .populate('folderId')
      .populate('requesterId', 'name email');

    if (!request) {
      return res.status(404).json({ success: false, error: 'Access request not found.' });
    }

    if (request.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied. Only the owner can reject this request.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Request has already been processed with status: ${request.status}`,
      });
    }

    const itemName = request.targetType === 'file' ? request.fileId?.originalName : request.folderId?.name;

    request.status = 'rejected';
    request.rejectionReason = reason.trim();
    request.respondedAt = new Date();
    await request.save();

    // Notify the recipient
    await Notification.create({
      userId: request.requesterId._id,
      type: 'request_rejected',
      title: 'Access Request Rejected',
      message: `Your access request for "${itemName || 'the shared item'}" was rejected by the owner.${reason ? ` Reason: ${reason}` : ''}`,
      linkToken: request.linkToken,
      fileId: request.targetType === 'file' ? request.fileId?._id : null,
      folderId: request.targetType === 'folder' ? request.folderId?._id : null,
      accessRequestId: request._id,
    });

    // Immutable audit log
    await auditService.log({
      fileId: request.targetType === 'file' ? request.fileId?._id : null,
      folderId: request.targetType === 'folder' ? request.folderId?._id : null,
      actorId: req.user._id,
      action: 'access_request_rejected',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        requestId: request._id,
        recipientId: request.requesterId._id,
        recipientEmail: request.requesterId.email,
        reason,
        itemName,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Access request rejected. Access remains blocked.',
      request,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createAccessRequest,
  getRequestStatusForToken,
  listOwnerRequests,
  approveRequest,
  rejectRequest,
};
