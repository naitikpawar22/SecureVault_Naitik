const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
      maxlength: 255,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    s3ObjectKey: {
      type: String,
      required: [true, 'S3 object key is required'],
      unique: true,
      index: true,
    },
    encryptedSize: {
      type: Number,
      required: [true, 'Encrypted file size is required'],
      min: 0,
    },
    mimeType: {
      type: String,
      default: 'application/octet-stream',
    },
    encryptedFileKey: {
      // The AES-256-GCM file key, wrapped for the owner via ECDH/AES-KW
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Encrypted file key is required for zero-knowledge decryption'],
    },
    encryptionAlgorithm: {
      type: String,
      default: 'AES-256-GCM',
    },
    iv: {
      // Initialization vector used for AES-GCM file encryption
      type: String,
      required: [true, 'Encryption IV is required'],
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      index: true,
    },
    currentVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active files by owner
fileSchema.index({ ownerId: 1, status: 1 });
fileSchema.index({ createdAt: -1 });

const File = mongoose.model('File', fileSchema);

module.exports = File;
