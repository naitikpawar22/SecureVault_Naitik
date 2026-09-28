const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Session expired. Please log in again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token.',
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.',
      });
    }

    req.user = user;
    // Track whether MFA has been verified for this token/session
    req.user.mfaVerified = decoded.mfaVerified === true;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware ensuring user has MFA enabled and verified for this session
 */
const requireMfa = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    });
  }

  if (!req.user.mfaEnabled) {
    return res.status(403).json({
      success: false,
      code: 'MFA_SETUP_REQUIRED',
      error: 'MFA setup is required before performing this action.',
    });
  }

  if (!req.user.mfaVerified) {
    return res.status(403).json({
      success: false,
      code: 'MFA_VERIFICATION_REQUIRED',
      error: 'MFA verification required for this session.',
    });
  }

  next();
};

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.requireMfa = requireMfa;

