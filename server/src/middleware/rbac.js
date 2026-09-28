const mongoose = require('mongoose');
const File = require('../models/File');
const Folder = require('../models/Folder');
const FilePermission = require('../models/FilePermission');

/**
 * Check if the authenticated user has access to the requested fileId parameter.
 * @param {'viewer'|'owner'} requiredRole Minimum role required
 */
const checkFileAccess = (requiredRole = 'viewer') => {
  return async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file ID format.',
        });
      }

      const file = await File.findById(id);
      if (!file || file.status === 'deleted') {
        return res.status(404).json({
          success: false,
          error: 'File not found.',
        });
      }

      const userId = req.user._id;

      // 1. Is the user the direct owner?
      if (file.ownerId.equals(userId)) {
        req.fileDoc = file;
        req.userRole = 'owner';
        req.wrappedFileKey = file.encryptedFileKey;
        return next();
      }

      // If owner is strictly required (e.g. for sharing, revoking, deleting)
      if (requiredRole === 'owner') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Only the file owner can perform this operation.',
        });
      }

      // 2. Otherwise, check FilePermission collection
      let permission = await FilePermission.findOne({
        fileId: file._id,
        userId: userId,
        isRevoked: { $ne: true },
      });

      // If not directly in FilePermission, check if user has access via parent Folder
      if (!permission && file.folderId) {
        const parentFolder = await Folder.findOne({
          _id: file.folderId,
          status: 'active',
          'sharedWith.userId': userId,
        });

        if (parentFolder) {
          const sw = parentFolder.sharedWith.find((s) => s.userId.toString() === userId.toString());
          if (sw && (!sw.expiresAt || new Date() <= sw.expiresAt)) {
            permission = {
              role: sw.role,
              allowDownload: sw.allowDownload !== false,
              expiresAt: sw.expiresAt,
              wrappedFileKey: file.encryptedFileKey,
            };
          }
        }
      }

      if (!permission) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You do not have permission to access this file.',
        });
      }

      // Check expiration
      if (permission.expiresAt && new Date() > permission.expiresAt) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Your permission to access this file has expired.',
          code: 'PERMISSION_EXPIRED',
        });
      }

      // If editor role is required, ensure user has editor permission
      if (requiredRole === 'editor' && permission.role !== 'editor') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Edit permission required to perform this action.',
        });
      }

      req.fileDoc = file;
      req.userRole = permission.role;
      req.permissionDoc = permission;
      req.wrappedFileKey = permission.wrappedFileKey;
      return next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Require system administrator role
 */
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'Access denied. Administrator privileges required.',
  });
};

module.exports = { checkFileAccess, requireAdmin };
