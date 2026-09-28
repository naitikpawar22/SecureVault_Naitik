const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const multipartController = require('../controllers/multipartController');
const shareLinkController = require('../controllers/shareLinkController');
const manageAccessController = require('../controllers/manageAccessController');
const authenticate = require('../middleware/auth');
const { checkFileAccess } = require('../middleware/rbac');
const { uploadLimiter, chunkUploadLimiter } = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');
const { validateUpload } = require('../validators/fileValidator');

// All file routes require authentication
router.use(authenticate);

// === Multipart / Chunked Upload Routes (for 1GB+ files) ===
router.post('/multipart/initiate', uploadLimiter, multipartController.initiate);
router.post(
  '/multipart/chunk',
  chunkUploadLimiter,
  upload.single('chunk'),
  multipartController.uploadPart
);
router.post('/multipart/complete', multipartController.complete);
router.post('/multipart/abort', multipartController.abort);

// === Standard Upload Route ===
router.post(
  '/upload',
  uploadLimiter,
  upload.single('encryptedFile'),
  validateUpload,
  fileController.uploadFile
);

// === File Listing, Search & Details ===
router.get('/', fileController.listFiles);
router.get('/encrypted-search', fileController.encryptedSearch);
router.get('/:id', checkFileAccess('viewer'), fileController.getFile);
router.get('/:id/download', checkFileAccess('viewer'), fileController.downloadFile);
router.patch('/:id/rename', checkFileAccess('owner'), fileController.renameFile);
router.delete('/:id', checkFileAccess('delete'), fileController.deleteFile);

// === Shareable Links & Key Rotation (Owner only) ===
router.post('/:id/share-link', checkFileAccess('owner'), shareLinkController.createShareLink);
router.get('/:id/share-links', checkFileAccess('owner'), shareLinkController.listShareLinks);
router.delete('/:id/share-link/:linkId', checkFileAccess('owner'), shareLinkController.revokeShareLink);
router.patch('/:id/share-link/:linkId', checkFileAccess('owner'), manageAccessController.updateFileShareLink);
router.post('/:id/rotate-key', checkFileAccess('owner'), upload.single('reEncryptedFile'), shareLinkController.rotateKey);

// === File Access Management (Owner only - Requirement 8) ===
router.get('/:id/manage-access', checkFileAccess('owner'), manageAccessController.getFileAccessManagement);
router.patch('/:id/permissions/:userId', checkFileAccess('owner'), manageAccessController.updateFileRecipientPermission);
router.delete('/:id/permissions/:userId', checkFileAccess('owner'), manageAccessController.revokeFileRecipient);

// === File Version Management (Editor & Viewer Access) ===
router.get('/:id/versions', checkFileAccess('viewer'), fileController.listVersions);
router.post('/:id/versions', checkFileAccess('editor'), upload.single('encryptedFile'), fileController.createVersion);
router.get('/:id/versions/:versionNumber/download', checkFileAccess('viewer'), fileController.downloadVersion);
router.post('/:id/versions/:versionNumber/restore', checkFileAccess('editor'), fileController.restoreVersion);

module.exports = router;
