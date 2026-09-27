const express = require('express');
const router = express.Router();
const shareLinkController = require('../controllers/shareLinkController');
const upload = require('../middleware/upload');

// Public access via cryptographic token
router.get('/link/:token', shareLinkController.accessShareLink);
router.get('/link/:token/download', shareLinkController.downloadShareLinkFile);

// Editor updates via share link (if link has 'editor' role)
router.post('/link/:token/update', upload.single('updatedFile'), shareLinkController.updateSharedLinkFile);

module.exports = router;
