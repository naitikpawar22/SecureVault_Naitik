const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    publicKey: {
      // ECDH public key (JWK format) for zero-knowledge key sharing
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Public key is required for end-to-end encryption'],
    },
    encryptedPrivateKey: {
      // Client-encrypted private key bundle (ciphertext, salt, iv)
      // Decryptable only in the client browser with the user's password KEK.
      // The server never knows the plaintext private key.
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Never expose passwordHash or internal sensitive data in toJSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.passwordHash;
  delete user.__v;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
