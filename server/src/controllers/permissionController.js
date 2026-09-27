const User = require('../models/User');
const FilePermission = require('../models/FilePermission');
const auditService = require('../services/auditService');

const normalizeRole = (role) => {
  if (!role) return 'viewer';
  const lower = role.toLowerCase().trim();
  if (lower === 'edit' || lower === 'editor') return 'editor';
  return 'viewer';
};

const shareFile = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const { targetEmail, targetUserId, wrappedFileKey, role = 'viewer' } = req.body;

    let targetUser = null;
    if (targetUserId) {
      targetUser = await User.findById(targetUserId);
    } else if (targetEmail) {
      targetUser = await User.findOne({ email: targetEmail.toLowerCase().trim() });
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Recipient user not found. Please ensure the user is registered with this email.',
      });
    }

    if (targetUser._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        error: 'You cannot share a file with yourself as you are already the owner.',
      });
    }

    const assignedRole = normalizeRole(role);

    // Parse wrappedFileKey if stringified
    let parsedKey = wrappedFileKey;
    if (typeof wrappedFileKey === 'string') {
      try {
        parsedKey = JSON.parse(wrappedFileKey);
      } catch (e) {
        parsedKey = wrappedFileKey;
      }
    }

    // Upsert permission record
    const permission = await FilePermission.findOneAndUpdate(
      { fileId: file._id, userId: targetUser._id },
      {
        role: assignedRole,
        wrappedFileKey: parsedKey,
        grantedBy: req.user._id,
        createdAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Immutable audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'share',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        recipientEmail: targetUser.email,
        recipientName: targetUser.name,
        recipientId: targetUser._id,
        role: assignedRole,
        actionDetail: `Granted ${assignedRole === 'editor' ? 'Edit' : 'View Only'} access`,
      },
    });

    res.status(200).json({
      success: true,
      message: `File shared securely with ${targetUser.email}`,
      permission: {
        id: permission._id,
        userId: targetUser._id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        role: permission.role,
        createdAt: permission.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

const shareBatch = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const { shares } = req.body;

    if (!Array.isArray(shares) || shares.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Shares list must be a non-empty array.',
      });
    }

    const addedPermissions = [];

    for (const item of shares) {
      const { targetEmail, targetUserId, wrappedFileKey, role = 'viewer' } = item;

      let targetUser = null;
      if (targetUserId) {
        targetUser = await User.findById(targetUserId);
      } else if (targetEmail) {
        targetUser = await User.findOne({ email: targetEmail.toLowerCase().trim() });
      }

      if (!targetUser) {
        continue;
      }

      if (targetUser._id.equals(req.user._id)) {
        continue;
      }

      const assignedRole = normalizeRole(role);

      let parsedKey = wrappedFileKey;
      if (typeof wrappedFileKey === 'string') {
        try {
          parsedKey = JSON.parse(wrappedFileKey);
        } catch (e) {
          parsedKey = wrappedFileKey;
        }
      }

      const permission = await FilePermission.findOneAndUpdate(
        { fileId: file._id, userId: targetUser._id },
        {
          role: assignedRole,
          wrappedFileKey: parsedKey,
          grantedBy: req.user._id,
          createdAt: new Date(),
        },
        { upsert: true, new: true }
      );

      await auditService.log({
        fileId: file._id,
        actorId: req.user._id,
        action: 'share',
        ipAddress: req.ip || req.connection.remoteAddress,
        metadata: {
          originalName: file.originalName,
          recipientEmail: targetUser.email,
          recipientName: targetUser.name,
          recipientId: targetUser._id,
          role: assignedRole,
          actionDetail: `Granted ${assignedRole === 'editor' ? 'Edit' : 'View Only'} access`,
        },
      });

      addedPermissions.push({
        id: permission._id,
        userId: targetUser._id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        role: permission.role,
        createdAt: permission.createdAt,
      });
    }

    res.status(200).json({
      success: true,
      message: `File shared securely with ${addedPermissions.length} user(s).`,
      permissions: addedPermissions,
    });
  } catch (err) {
    next(err);
  }
};

const updatePermission = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const { userId } = req.params;
    const { role } = req.body;

    const assignedRole = normalizeRole(role);

    const permission = await FilePermission.findOneAndUpdate(
      { fileId: file._id, userId },
      { role: assignedRole },
      { new: true }
    ).populate('userId', 'name email');

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found for this user.',
      });
    }

    // Audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'share',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        recipientEmail: permission.userId ? permission.userId.email : userId,
        role: assignedRole,
        actionDetail: `Permission updated to ${assignedRole === 'editor' ? 'Edit' : 'View Only'}`,
      },
    });

    res.status(200).json({
      success: true,
      message: `Permission updated to ${assignedRole === 'editor' ? 'Edit' : 'View Only'}.`,
      permission: {
        id: permission._id,
        userId: permission.userId._id,
        name: permission.userId.name,
        email: permission.userId.email,
        role: permission.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

const listPermissions = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')

    const permissions = await FilePermission.find({ fileId: file._id })
      .populate('userId', 'name email role avatar')
      .populate('grantedBy', 'name email');

    const formatted = permissions
      .filter((p) => p.userId != null)
      .map((p) => ({
        id: p._id,
        userId: p.userId._id,
        name: p.userId.name,
        email: p.userId.email,
        avatar: p.userId.avatar || '',
        role: p.role,
        grantedBy: p.grantedBy
          ? {
              name: p.grantedBy.name,
              email: p.grantedBy.email,
            }
          : null,
        createdAt: p.createdAt,
      }));

    res.status(200).json({
      success: true,
      permissions: formatted,
    });
  } catch (err) {
    next(err);
  }
};

const revokePermission = async (req, res, next) => {
  try {
    const file = req.fileDoc; // Verified by checkFileAccess('owner')
    const { userId } = req.params;

    const permission = await FilePermission.findOneAndDelete({
      fileId: file._id,
      userId,
    }).populate('userId', 'name email');

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found for this user.',
      });
    }

    // Audit log
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'revoke',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        revokedEmail: permission.userId ? permission.userId.email : userId,
        actionDetail: 'Revoked access permission',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Access permission revoked successfully.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  shareFile,
  shareBatch,
  updatePermission,
  listPermissions,
  revokePermission,
};
