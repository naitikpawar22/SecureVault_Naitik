const express = require('express');
const router = express.Router();
const shareLinkController = require('../controllers/shareLinkController');
const upload = require('../middleware/upload');

// Flexible single-file middleware supporting either 'updatedFile', 'encryptedFile', or 'file'
const uploadFlexSingle = (preferredField) => (req, res, next) => {
  upload.fields([
    { name: preferredField, maxCount: 1 },
    { name: 'encryptedFile', maxCount: 1 },
    { name: 'updatedFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);
    if (req.files) {
      req.file =
        req.files[preferredField]?.[0] ||
        req.files['encryptedFile']?.[0] ||
        req.files['updatedFile']?.[0] ||
        req.files['file']?.[0] ||
        null;
    }
    next();
  });
};

// Public access via cryptographic token
router.get('/link/:token', shareLinkController.accessShareLink);
router.get('/link/:token/download', shareLinkController.downloadShareLinkFile);

// Editor updates via share link (if link has 'editor' role)
router.post('/link/:token/update', uploadFlexSingle('updatedFile'), shareLinkController.updateSharedLinkFile);
router.post('/link/:token/upload', uploadFlexSingle('encryptedFile'), shareLinkController.uploadSharedFolderFile);
router.delete('/link/:token/file/:fileId', shareLinkController.deleteSharedFolderFile);

module.exports = router;
