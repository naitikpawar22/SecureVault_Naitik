const express = require('express');
const router = express.Router({ mergeParams: true });
const permissionController = require('../controllers/permissionController');
const authenticate = require('../middleware/auth');
const { checkFileAccess } = require('../middleware/rbac');
const { validateShare } = require('../validators/fileValidator');

// All permission routes require authentication and file ownership
router.use(authenticate);

// Share file with another user (owner only)
router.post(
  '/:id/share',
  checkFileAccess('owner'),
  validateShare,
  permissionController.shareFile
);

// Batch share file with multiple users (owner only)
router.post(
  '/:id/share-batch',
  checkFileAccess('owner'),
  permissionController.shareBatch
);

// Update permission role for an existing user (owner only)
router.patch(
  '/:id/permissions/:userId',
  checkFileAccess('owner'),
  permissionController.updatePermission
);

// List all permissions for a file (owner only)
router.get(
  '/:id/permissions',
  checkFileAccess('owner'),
  permissionController.listPermissions
);

// Revoke access permission for a user (owner only)
router.delete(
  '/:id/permissions/:userId',
  checkFileAccess('owner'),
  permissionController.revokePermission
);

module.exports = router;
