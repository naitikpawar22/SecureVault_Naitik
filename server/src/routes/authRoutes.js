const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../validators/authValidator');
const { authLimiter, mfaLimiter } = require('../middleware/rateLimiter');
const authenticate = require('../middleware/auth');

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

// === MFA Endpoints ===
router.post('/mfa/setup', authenticate, authController.setupMfa);
router.post('/mfa/verify-setup', authenticate, mfaLimiter, authController.verifyMfaSetup);
router.post('/mfa/verify', authenticate, mfaLimiter, authController.verifyMfa);
router.post('/mfa/disable', authenticate, authController.disableMfa);

module.exports = router;
