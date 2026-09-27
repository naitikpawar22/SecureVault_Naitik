const mongoose = require('mongoose');

const folderShareLinkSchema = new mongoose.Schema(
  {
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      required: [true, 'Folder ID is required'],
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

folderShareLinkSchema.index({ folderId: 1, isRevoked: 1 });

const FolderShareLink = mongoose.model('FolderShareLink', folderShareLinkSchema);

module.exports = FolderShareLink;
