const mongoose = require('mongoose');

const fileVersionSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: [true, 'File ID is required'],
      index: true,
    },
    versionNumber: {
      type: Number,
      required: [true, 'Version number is required'],
    },
    s3ObjectKey: {
      type: String,
      required: [true, 'S3 object key is required'],
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
    iv: {
      type: String,
      required: [true, 'Encryption IV is required'],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploaded by user ID is required'],
    },
    changeSummary: {
      type: String,
      default: '',
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

// Compound index for querying versions of a file chronologically
fileVersionSchema.index({ fileId: 1, versionNumber: -1 });
fileVersionSchema.index({ fileId: 1, createdAt: -1 });

const FileVersion = mongoose.model('FileVersion', fileVersionSchema);

module.exports = FileVersion;
