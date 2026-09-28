const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const manageAccessController = require('../controllers/manageAccessController');
const authenticate = require('../middleware/auth');

// All folder routes require authentication
router.use(authenticate);

router.post('/', folderController.createFolder);
router.get('/', folderController.listFolders);
router.patch('/:id', folderController.renameFolder);
router.delete('/:id', folderController.deleteFolder);

// Folder Sharing & Access Control
router.post('/:id/share', folderController.shareFolder);
router.get('/:id/permissions', folderController.listFolderPermissions);
router.delete('/:id/permissions/:userId', folderController.revokeFolderPermission);
router.get('/:id/audit', folderController.getFolderAuditLogs);

// Folder Shareable Links
router.post('/:id/share-link', folderController.createFolderShareLink);
router.get('/:id/share-links', folderController.listFolderShareLinks);
router.delete('/:id/share-link/:linkId', folderController.revokeFolderShareLink);

// Folder Manage Access (Requirement 8)
router.get('/:id/manage-access', manageAccessController.getFolderAccessManagement);
router.patch('/:id/permissions/:userId', manageAccessController.updateFolderRecipientPermission);
router.patch('/:id/share-link/:linkId', manageAccessController.updateFolderShareLink);

module.exports = router;
