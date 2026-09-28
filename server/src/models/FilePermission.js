const mongoose = require('mongoose');

const filePermissionSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: [true, 'File ID is required'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'viewer', 'editor'],
      default: 'viewer',
    },
    wrappedFileKey: {
      // The AES-256-GCM file key, wrapped specifically for this user using ECDH key agreement
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Wrapped file key is required for shared decryption'],
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Granter user ID is required'],
    },
    allowDownload: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isRevoked: {
      type: Boolean,
      default: false,
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

// Compound unique index ensuring one permission entry per file per user
filePermissionSchema.index({ fileId: 1, userId: 1 }, { unique: true });
filePermissionSchema.index({ userId: 1, role: 1 });

const FilePermission = mongoose.model('FilePermission', filePermissionSchema);

module.exports = FilePermission;
