const User = require('../models/User');

const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;

    // Do not show all registered users by default
    if (!query || query.trim().length === 0) {
      return res.status(200).json({
        success: true,
        users: [],
      });
    }

    const filter = {
      _id: { $ne: req.user._id },
      $or: [
        { name: { $regex: query.trim(), $options: 'i' } },
        { email: { $regex: query.trim(), $options: 'i' } },
      ],
    };

    const users = await User.find(filter)
      .select('name email role avatar publicKey createdAt')
      .limit(10);

    res.status(200).json({
      success: true,
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        avatar: u.avatar,
        publicKey: u.publicKey,
      })),
    });
  } catch (err) {
    next(err);
  }
};

const lookupUserByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (cleanEmail === req.user.email.toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        error: 'You cannot share a file with yourself as you are already the owner.',
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select(
      'name email role avatar publicKey'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No registered user found with this email address.',
      });
    }

    if (!user.publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Recipient user does not have an active encryption public key.',
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        publicKey: user.publicKey,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getUserPublicKey = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('publicKey name email');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found.',
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        publicKey: user.publicKey,
      },
    });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (name && name.trim()) {
      user.name = name.trim();
    }
    if (avatar !== undefined) {
      user.avatar = avatar;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  searchUsers,
  lookupUserByEmail,
  getUserPublicKey,
  updateProfile,
};
