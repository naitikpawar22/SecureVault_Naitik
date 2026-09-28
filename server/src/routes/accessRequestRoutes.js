const express = require('express');
const router = express.Router();
const accessRequestController = require('../controllers/accessRequestController');
const authenticate = require('../middleware/auth');
const { accessRequestLimiter } = require('../middleware/rateLimiter');

// All access request operations require authentication
router.use(authenticate);

// Create request for a share link (rate limited)
router.post('/', accessRequestLimiter, accessRequestController.createAccessRequest);

// Check status of current user's request for a link token
router.get('/status/:token', accessRequestController.getRequestStatusForToken);

// Owner-side: List requests for items owned by current user
router.get('/owner', accessRequestController.listOwnerRequests);

// Owner-side: Approve or Reject
router.post('/:id/approve', accessRequestController.approveRequest);
router.post('/:id/reject', accessRequestController.rejectRequest);

// Owner-side: Update role (Viewer <-> Editor) and Disable/Revoke access
router.patch('/:id', accessRequestController.updateRequestPermission);
router.post('/:id/revoke', accessRequestController.revokeRequestAccess);

module.exports = router;
