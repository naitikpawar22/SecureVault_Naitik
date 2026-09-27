const validateUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Encrypted file payload is required.',
    });
  }

  const { originalName, encryptedFileKey, iv } = req.body;

  if (!originalName || typeof originalName !== 'string' || originalName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Original file name is required.',
    });
  }

  if (!encryptedFileKey) {
    return res.status(400).json({
      success: false,
      error: 'Encrypted file key is required for zero-knowledge decryption.',
    });
  }

  if (!iv || typeof iv !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Initialization vector (IV) is required.',
    });
  }

  next();
};

const validateShare = (req, res, next) => {
  const { targetEmail, targetUserId, wrappedFileKey, role } = req.body;

  if (!targetEmail && !targetUserId) {
    return res.status(400).json({
      success: false,
      error: 'Target user email or user ID is required.',
    });
  }

  if (!wrappedFileKey) {
    return res.status(400).json({
      success: false,
      error: 'Wrapped file key for recipient is required.',
    });
  }

  if (role && !['viewer', 'editor', 'owner'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: "Role must be either 'viewer', 'editor', or 'owner'.",
    });
  }

  next();
};

module.exports = { validateUpload, validateShare };
