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

      // Check if file is inside a parent folder with permissions
      let parentFolder = null;
      let folderRole = null;
      if (file.folderId) {
        parentFolder = await Folder.findOne({
          _id: file.folderId,
          status: 'active',
          $or: [
            { ownerId: userId },
            { 'sharedWith.userId': userId },
          ],
        });

        if (parentFolder) {
          req.parentFolder = parentFolder;
          if (parentFolder.ownerId.equals(userId)) {
            folderRole = 'owner';
          } else {
            const sw = parentFolder.sharedWith.find((s) => s.userId.toString() === userId.toString());
            if (sw && (!sw.expiresAt || new Date() <= sw.expiresAt)) {
              folderRole = sw.role; // 'editor' or 'viewer'
            }
          }
        }
      }

      // Check for deletion permission (Owner or Folder Editor)
      if (requiredRole === 'delete') {
        if (folderRole === 'owner' || folderRole === 'editor') {
          req.fileDoc = file;
          req.userRole = folderRole;
          req.wrappedFileKey = file.encryptedFileKey;
          return next();
        }
        return res.status(403).json({
          success: false,
          error: 'Access denied. Only the file owner or folder editor can delete this file.',
        });
      }

      // If owner is strictly required (e.g. for sharing, revoking)
      if (requiredRole === 'owner') {
        if (folderRole === 'owner') {
          req.fileDoc = file;
          req.userRole = 'owner';
          req.wrappedFileKey = file.encryptedFileKey;
          return next();
        }
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

      // If not directly in FilePermission, use folder permission
      if (!permission && folderRole) {
        permission = {
          role: folderRole,
          allowDownload: true,
          wrappedFileKey: file.encryptedFileKey,
        };
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
      if (requiredRole === 'editor' && permission.role !== 'editor' && folderRole !== 'editor') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Edit permission required to perform this action.',
        });
      }

      req.fileDoc = file;
      req.userRole = permission.role || folderRole || 'viewer';
      req.permissionDoc = permission;
      req.wrappedFileKey = permission.wrappedFileKey || file.encryptedFileKey;
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
