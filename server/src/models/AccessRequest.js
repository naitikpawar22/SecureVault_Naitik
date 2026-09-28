const mongoose = require('mongoose');

const accessRequestSchema = new mongoose.Schema(
  {
    linkId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    linkToken: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['file', 'folder'],
      required: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      default: null,
      index: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester user ID is required'],
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner user ID is required'],
      index: true,
    },
    requestedRole: {
      type: String,
      enum: ['viewer', 'editor'],
      default: 'viewer',
    },
    grantedRole: {
      type: String,
      enum: ['viewer', 'editor'],
      default: 'viewer',
    },
    allowDownload: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'revoked'],
      default: 'pending',
      index: true,
    },
    message: {
      type: String,
      default: '',
      maxlength: 500,
    },
    rejectionReason: {
      type: String,
      default: '',
      maxlength: 500,
    },
    requestDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate pending requests from the same user for the same link
accessRequestSchema.index({ linkToken: 1, requesterId: 1, status: 1 });
accessRequestSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
accessRequestSchema.index({ requesterId: 1, createdAt: -1 });

const AccessRequest = mongoose.model('AccessRequest', accessRequestSchema);

module.exports = AccessRequest;
