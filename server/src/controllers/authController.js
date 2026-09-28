const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const auditService = require('../services/auditService');
const totp = require('../utils/totp');

/**
 * Generate Access and Refresh JWT Tokens
 */
const generateTokens = async (userId, mfaVerified = false) => {
  const accessToken = jwt.sign(
    { id: userId, mfaVerified: Boolean(mfaVerified) },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
    }
  );

  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await RefreshToken.create({
    userId,
    tokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken: rawRefreshToken };
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, publicKey, encryptedPrivateKey } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists.',
      });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'user',
      publicKey,
      encryptedPrivateKey: encryptedPrivateKey || null,
      mfaEnabled: false,
    });

    const tokens = await generateTokens(user._id, false);

    await auditService.log({
      actorId: user._id,
      action: 'register',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: { email: user.email },
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        mfaEnabled: false,
        mfaVerified: false,
      },
      mfaRequired: false,
      mfaVerified: false,
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    // If MFA is enabled, token initially has mfaVerified: false until 6-digit TOTP is submitted
    const mfaRequired = Boolean(user.mfaEnabled);
    const mfaVerified = !mfaRequired; // If MFA not enabled, user is considered mfaVerified: true for session
    const tokens = await generateTokens(user._id, mfaVerified);

    await auditService.log({
      actorId: user._id,
      action: 'login',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: { email: user.email, mfaRequired },
    });

    res.status(200).json({
      success: true,
      message: mfaRequired ? 'Password verified. MFA verification required.' : 'Login successful',
      mfaRequired,
      mfaVerified,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        mfaEnabled: user.mfaEnabled,
        mfaVerified,
      },
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Setup MFA - Generate secret & QR code data URL
 */
const setupMfa = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const secret = totp.generateSecret();
    const qrCode = await totp.generateQrCodeDataUrl(user.email, secret);

    res.status(200).json({
      success: true,
      secret,
      qrCode,
      message: 'MFA secret generated. Please scan the QR code in your authenticator app and enter the 6-digit code to verify.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Verify MFA Setup & Enable MFA for Account
 */
const verifyMfaSetup = async (req, res, next) => {
  try {
    const { code, secret } = req.body;
    if (!code || !secret) {
      return res.status(400).json({ success: false, error: '6-digit verification code and setup secret are required.' });
    }

    const isValid = totp.verifyOtp(code, secret);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid 6-digit verification code. Please try again.' });
    }

    const user = await User.findById(req.user._id);
    user.mfaEnabled = true;
    user.mfaSecret = secret;
    await user.save();

    await auditService.log({
      actorId: user._id,
      action: 'mfa_enabled',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: { email: user.email },
    });

    // Issue updated token with mfaVerified: true
    const tokens = await generateTokens(user._id, true);

    res.status(200).json({
      success: true,
      message: 'Two-Factor Authentication (MFA) enabled and verified successfully!',
      mfaVerified: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        mfaEnabled: true,
        mfaVerified: true,
      },
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Verify TOTP for session/login attempt
 */
const verifyMfa = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: '6-digit verification code is required.' });
    }

    const user = await User.findById(req.user._id).select('+mfaSecret');
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ success: false, error: 'MFA is not enabled on this account.' });
    }

    const isValid = totp.verifyOtp(code, user.mfaSecret);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid 6-digit verification code.' });
    }

    await auditService.log({
      actorId: user._id,
      action: 'mfa_verified',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: { email: user.email },
    });

    // Issue updated token with mfaVerified: true
    const tokens = await generateTokens(user._id, true);

    res.status(200).json({
      success: true,
      message: 'MFA verification successful.',
      mfaVerified: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        mfaEnabled: true,
        mfaVerified: true,
      },
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Disable MFA
 */
const disableMfa = async (req, res, next) => {
  try {
    const { password, code } = req.body;
    const user = await User.findById(req.user._id).select('+mfaSecret');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (password) {
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Incorrect password.' });
      }
    }

    if (code && user.mfaSecret) {
      const isValid = totp.verifyOtp(code, user.mfaSecret);
      if (!isValid) {
        return res.status(400).json({ success: false, error: 'Invalid 6-digit verification code.' });
      }
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    await user.save();

    await auditService.log({
      actorId: user._id,
      action: 'mfa_disabled',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: { email: user.email },
    });

    const tokens = await generateTokens(user._id, false);

    res.status(200).json({
      success: true,
      message: 'MFA has been disabled for your account.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        mfaEnabled: false,
        mfaVerified: false,
      },
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: rawToken } = req.body;
    if (!rawToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const storedToken = await RefreshToken.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token.',
      });
    }

    // Revoke old refresh token (token rotation)
    storedToken.revokedAt = new Date();
    await storedToken.save();

    const user = await User.findById(storedToken.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found.',
      });
    }

    // Maintain current mfaVerified state if user has MFA enabled
    const mfaVerified = !user.mfaEnabled;
    const newTokens = await generateTokens(user._id, mfaVerified);

    res.status(200).json({
      success: true,
      ...newTokens,
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken: rawToken } = req.body;
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await RefreshToken.updateOne({ tokenHash }, { revokedAt: new Date() });
    }

    if (req.user) {
      await auditService.log({
        actorId: req.user._id,
        action: 'logout',
        ipAddress: req.ip || req.connection.remoteAddress,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        mfaEnabled: Boolean(user.mfaEnabled),
        mfaVerified: Boolean(req.user.mfaVerified),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  setupMfa,
  verifyMfaSetup,
  verifyMfa,
  disableMfa,
  refreshToken,
  logout,
  getMe,
};
