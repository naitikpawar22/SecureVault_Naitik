const { v4: uuidv4 } = require('uuid');
const storageService = require('../services/storageService');
const auditService = require('../services/auditService');
const File = require('../models/File');

/**
 * Initiate a chunked multipart upload session
 */
const initiate = async (req, res, next) => {
  try {
    const { originalName, mimeType } = req.body;
    if (!originalName) {
      return res.status(400).json({ success: false, error: 'Original file name is required' });
    }

    const s3ObjectKey = `vault-${uuidv4()}-${Date.now()}.bin`;
    const session = await storageService.initiateMultipartUpload(s3ObjectKey, mimeType || 'application/octet-stream');

    res.status(200).json({
      success: true,
      uploadId: session.uploadId,
      s3ObjectKey,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Upload an individual chunk part
 */
const uploadPart = async (req, res, next) => {
  try {
    const { uploadId, s3ObjectKey, partNumber } = req.body;

    if (!uploadId || !s3ObjectKey || !partNumber) {
      return res.status(400).json({ success: false, error: 'Missing uploadId, s3ObjectKey, or partNumber' });
    }

    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, error: 'Chunk payload is required' });
    }

    const fs = require('fs');
    const partBuffer = await fs.promises.readFile(req.file.path);

    // Clean up multer temporary chunk
    fs.unlink(req.file.path, () => {});

    const partInfo = await storageService.uploadPart(
      s3ObjectKey,
      uploadId,
      Number(partNumber),
      partBuffer
    );

    res.status(200).json({
      success: true,
      partNumber: partInfo.partNumber,
      etag: partInfo.etag,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Complete multipart upload and commit file metadata in MongoDB Atlas
 */
const complete = async (req, res, next) => {
  try {
    const {
      uploadId,
      s3ObjectKey,
      parts,
      originalName,
      mimeType,
      encryptedFileKey,
      iv,
      encryptedSize,
      folderId,
      searchTokens,
    } = req.body;

    if (!uploadId || !s3ObjectKey || !parts || !Array.isArray(parts)) {
      return res.status(400).json({ success: false, error: 'Invalid completion request parameters' });
    }

    // 1. Finalize in S3 / Vault
    await storageService.completeMultipartUpload(s3ObjectKey, uploadId, parts);

    // 2. Parse encryptedFileKey if stringified
    let parsedKey = encryptedFileKey;
    if (typeof encryptedFileKey === 'string') {
      try {
        parsedKey = JSON.parse(encryptedFileKey);
      } catch (e) {
        parsedKey = encryptedFileKey;
      }
    }

    // Parse searchTokens
    let parsedTokens = [];
    if (searchTokens) {
      if (Array.isArray(searchTokens)) {
        parsedTokens = searchTokens;
      } else if (typeof searchTokens === 'string') {
        try {
          parsedTokens = JSON.parse(searchTokens);
        } catch {
          parsedTokens = searchTokens.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
    }

    // 3. Create document in MongoDB Atlas File collection
    const file = await File.create({
      originalName: originalName.trim(),
      ownerId: req.user._id,
      folderId: folderId && folderId !== 'null' && folderId !== 'root' ? folderId : null,
      s3ObjectKey,
      encryptedSize: Number(encryptedSize),
      mimeType: mimeType || 'application/octet-stream',
      encryptedFileKey: parsedKey,
      encryptionAlgorithm: 'AES-256-GCM',
      iv,
      status: 'active',
      searchTokens: parsedTokens,
    });

    // 4. Log audit event
    await auditService.log({
      fileId: file._id,
      actorId: req.user._id,
      action: 'upload',
      ipAddress: req.ip || req.connection.remoteAddress,
      metadata: {
        originalName: file.originalName,
        size: file.encryptedSize,
        mimeType: file.mimeType,
        multipart: true,
        partsCount: parts.length,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Multipart upload completed successfully and saved to S3 & Vault.',
      file: {
        id: file._id,
        originalName: file.originalName,
        encryptedSize: file.encryptedSize,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Abort multipart upload
 */
const abort = async (req, res, next) => {
  try {
    const { uploadId, s3ObjectKey } = req.body;
    if (uploadId && s3ObjectKey) {
      await storageService.abortMultipartUpload(s3ObjectKey, uploadId);
    }
    res.status(200).json({ success: true, message: 'Multipart upload aborted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  initiate,
  uploadPart,
  complete,
  abort,
};
