const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// Search users for sharing dialog
router.get('/', userController.searchUsers);

// Look up a specific registered user by exact email
router.get('/lookup', userController.lookupUserByEmail);

// Get user's public key by ID
router.get('/:id/public-key', userController.getUserPublicKey);

// Update user profile (name, avatar)
router.patch('/profile', userController.updateProfile);

module.exports = router;
