const mongoose = require('mongoose');

const fileShareLinkSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: [true, 'File ID is required'],
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    wrappedFileKey: {
      // Optional wrapped key if link is password-protected or uses ephemeral key
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    role: {
      type: String,
      enum: ['viewer', 'editor'],
      default: 'viewer',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    maxAccessCount: {
      type: Number,
      default: null,
    },
    accessCount: {
      type: Number,
      default: 0,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    allowDownload: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Compound index for fast ACL lookups and user sharding
fileShareLinkSchema.index({ fileId: 1, isRevoked: 1 });

const FileShareLink = mongoose.model('FileShareLink', fileShareLinkSchema);

module.exports = FileShareLink;
