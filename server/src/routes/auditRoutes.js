const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const authenticate = require('../middleware/auth');
const { checkFileAccess } = require('../middleware/rbac');

router.use(authenticate);

// Get general audit history for the authenticated user
router.get('/', auditController.getMyAuditLogs);

// Get file-specific audit history (accessible by viewers and owners of that file)
router.get('/:id', checkFileAccess('viewer'), auditController.getFileAuditLogs);

module.exports = router;
