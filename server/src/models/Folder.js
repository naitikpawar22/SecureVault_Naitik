const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
      maxlength: 255,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    s3Prefix: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '#3b82f6',
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      index: true,
    },
    sharedWith: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          enum: ['viewer', 'editor'],
          default: 'viewer',
        },
        grantedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        allowDownload: {
          type: Boolean,
          default: true,
        },
        expiresAt: {
          type: Date,
          default: null,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

folderSchema.index({ ownerId: 1, parentId: 1, status: 1 });
folderSchema.index({ createdAt: -1 });

const Folder = mongoose.model('Folder', folderSchema);

module.exports = Folder;
