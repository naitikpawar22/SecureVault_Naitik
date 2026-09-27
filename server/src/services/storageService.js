const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config/env');

// Initialize S3 Client if credentials are provided
let s3Client = null;
const hasAwsCredentials = Boolean(
  config.aws.accessKeyId &&
  config.aws.secretAccessKey &&
  config.aws.bucket
);

if (hasAwsCredentials) {
  try {
    s3Client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    console.log(`[Storage] Initialized AWS S3 Client for bucket: "${config.aws.bucket}" in region: "${config.aws.region}"`);
  } catch (err) {
    console.warn(`[Storage Warning] Could not initialize S3 Client: ${err.message}`);
  }
} else {
  console.log('[Storage Notice] S3 credentials or bucket not fully configured. Using secure local vault storage.');
}

// Local storage directories
const localUploadsDir = path.resolve(__dirname, '../../uploads/encrypted');
const localTempDir = path.resolve(__dirname, '../../uploads/temp');
if (!fs.existsSync(localUploadsDir)) fs.mkdirSync(localUploadsDir, { recursive: true });
if (!fs.existsSync(localTempDir)) fs.mkdirSync(localTempDir, { recursive: true });

class StorageService {
  /**
   * Upload single encrypted file to local vault AND Amazon S3 bucket.
   */
  async uploadFile(objectKey, sourcePathOrBuffer, mimeType = 'application/octet-stream') {
    let fileBuffer;
    if (typeof sourcePathOrBuffer === 'string') {
      fileBuffer = await fs.promises.readFile(sourcePathOrBuffer);
    } else if (Buffer.isBuffer(sourcePathOrBuffer)) {
      fileBuffer = sourcePathOrBuffer;
    } else {
      throw new Error('Invalid source file parameter: must be file path or Buffer');
    }

    // 1. Always save a copy in the secure local vault on disk:
    const targetPath = path.join(localUploadsDir, objectKey);
    await fs.promises.writeFile(targetPath, fileBuffer);
    let s3Uploaded = false;

    // 2. Upload to Amazon S3 Bucket
    if (s3Client && config.aws.bucket) {
      try {
        const command = new PutObjectCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
          Body: fileBuffer,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        });
        await s3Client.send(command);
        s3Uploaded = true;
        console.log(`[Storage S3] Successfully uploaded encrypted file to S3 bucket "${config.aws.bucket}": ${objectKey}`);
      } catch (s3Error) {
        console.warn(`[Storage S3 Warning] S3 upload to bucket "${config.aws.bucket}" failed (${s3Error.message}).`);
      }
    }

    return {
      objectKey,
      storageType: s3Uploaded ? 'both' : 'local',
      s3Uploaded,
    };
  }

  /**
   * Initiate S3 Multipart Upload (for 1GB+ large chunked files)
   */
  async initiateMultipartUpload(objectKey, mimeType = 'application/octet-stream') {
    let s3UploadId = null;

    if (s3Client && config.aws.bucket) {
      try {
        const command = new CreateMultipartUploadCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        });
        const res = await s3Client.send(command);
        s3UploadId = res.UploadId;
        console.log(`[Storage S3 Multipart] Initiated S3 multipart upload ID: ${s3UploadId} for ${objectKey}`);
      } catch (err) {
        console.warn(`[Storage S3 Multipart Warning] S3 initiate failed (${err.message}). Using local chunk simulation.`);
      }
    }

    // Prepare local temp session directory for chunk assembly fallback
    const sessionDirName = s3UploadId ? `mp-${s3UploadId.replace(/[^a-zA-Z0-9_-]/g, '_')}` : `mp-local-${Date.now()}`;
    const sessionDir = path.join(localTempDir, sessionDirName);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    return {
      uploadId: s3UploadId || sessionDirName,
      sessionDir,
      s3Active: Boolean(s3UploadId),
    };
  }

  /**
   * Upload an individual chunk / part in multipart upload
   */
  async uploadPart(objectKey, uploadId, partNumber, partBuffer) {
    let etag = `local-etag-part-${partNumber}`;

    // 1. Upload part directly to S3 if active
    if (s3Client && config.aws.bucket && !uploadId.startsWith('mp-local-')) {
      try {
        const command = new UploadPartCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: partBuffer,
        });
        const res = await s3Client.send(command);
        etag = res.ETag ? res.ETag.replace(/"/g, '') : etag;
      } catch (err) {
        console.warn(`[Storage S3 Multipart Part Warning] Part ${partNumber} upload to S3 failed: ${err.message}`);
      }
    }

    // 2. Also save part in local temp session directory for local assembly
    const sessionDirName = uploadId.startsWith('mp-') ? uploadId : `mp-${uploadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const sessionDir = path.join(localTempDir, sessionDirName);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    
    const partPath = path.join(sessionDir, `part-${String(partNumber).padStart(5, '0')}.bin`);
    await fs.promises.writeFile(partPath, partBuffer);

    return {
      partNumber,
      etag,
    };
  }

  /**
   * Complete S3 Multipart Upload and assemble local vault copy
   */
  async completeMultipartUpload(objectKey, uploadId, parts) {
    const formattedParts = parts
      .map((p) => ({
        PartNumber: Number(p.partNumber || p.PartNumber),
        ETag: String(p.etag || p.ETag).replace(/"/g, ''),
      }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    let s3Completed = false;

    // 1. Finalize on AWS S3
    if (s3Client && config.aws.bucket && !uploadId.startsWith('mp-local-')) {
      try {
        const command = new CompleteMultipartUploadCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: formattedParts.map((p) => ({
              PartNumber: p.PartNumber,
              ETag: `"${p.ETag}"`,
            })),
          },
        });
        await s3Client.send(command);
        s3Completed = true;
        console.log(`[Storage S3 Multipart] Successfully completed S3 multipart upload for ${objectKey}`);
      } catch (err) {
        console.warn(`[Storage S3 Multipart Warning] S3 Complete failed (${err.message}).`);
      }
    }

    // 2. Assemble local file in vault from local parts
    const sessionDirName = uploadId.startsWith('mp-') ? uploadId : `mp-${uploadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const sessionDir = path.join(localTempDir, sessionDirName);
    const targetVaultPath = path.join(localUploadsDir, objectKey);

    if (fs.existsSync(sessionDir)) {
      const partFiles = (await fs.promises.readdir(sessionDir))
        .filter((f) => f.startsWith('part-'))
        .sort();

      const writeStream = fs.createWriteStream(targetVaultPath);
      for (const file of partFiles) {
        const partData = await fs.promises.readFile(path.join(sessionDir, file));
        writeStream.write(partData);
      }
      writeStream.end();

      // Clean up session directory
      fs.rm(sessionDir, { recursive: true, force: true }, () => {});
    }

    return {
      objectKey,
      s3Completed,
    };
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(objectKey, uploadId) {
    if (s3Client && config.aws.bucket && !uploadId.startsWith('mp-local-')) {
      try {
        const command = new AbortMultipartUploadCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
          UploadId: uploadId,
        });
        await s3Client.send(command);
      } catch (err) {
        console.warn('[Storage S3 Multipart Warning] Failed to abort on S3:', err.message);
      }
    }

    const sessionDirName = uploadId.startsWith('mp-') ? uploadId : `mp-${uploadId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const sessionDir = path.join(localTempDir, sessionDirName);
    if (fs.existsSync(sessionDir)) {
      fs.rm(sessionDir, { recursive: true, force: true }, () => {});
    }
  }

  /**
   * Retrieve encrypted file stream for download or preview
   */
  async getFileStream(objectKey) {
    // 1. Try local storage first if cached for instant high performance
    const localPath = path.join(localUploadsDir, objectKey);
    if (fs.existsSync(localPath)) {
      return fs.createReadStream(localPath);
    }

    // 2. If not local, stream directly from AWS S3
    if (s3Client && config.aws.bucket) {
      try {
        const command = new GetObjectCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
        });
        const response = await s3Client.send(command);
        return response.Body;
      } catch (s3Error) {
        console.warn(`[Storage Warning] S3 retrieval failed (${s3Error.message})`);
      }
    }

    throw new Error('Encrypted file not found in S3 or local storage');
  }

  /**
   * Delete encrypted file from both AWS S3 and local vault.
   */
  async deleteFile(objectKey) {
    if (s3Client && config.aws.bucket) {
      try {
        const command = new DeleteObjectCommand({
          Bucket: config.aws.bucket,
          Key: objectKey,
        });
        await s3Client.send(command);
        console.log(`[Storage S3] Deleted ${objectKey} from S3 bucket "${config.aws.bucket}"`);
      } catch (s3Error) {
        console.warn(`[Storage Warning] Failed to delete from S3: ${s3Error.message}`);
      }
    }

    const localPath = path.join(localUploadsDir, objectKey);
    if (fs.existsSync(localPath)) {
      try {
        await fs.promises.unlink(localPath);
      } catch (err) {
        console.warn(`[Storage Warning] Could not delete local file: ${err.message}`);
      }
    }
  }

  /**
   * Create folder marker in S3
   */
  async createFolder(folderKey) {
    const cleanKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;
    if (s3Client && config.aws.bucket) {
      try {
        const command = new PutObjectCommand({
          Bucket: config.aws.bucket,
          Key: cleanKey,
          Body: Buffer.alloc(0),
        });
        await s3Client.send(command);
        console.log(`[Storage S3] Created folder marker in S3: ${cleanKey}`);
      } catch (err) {
        console.warn(`[Storage S3 Warning] Could not create folder marker in S3: ${err.message}`);
      }
    }
  }

  /**
   * Rename folder in S3
   */
  async renameFolder(oldFolderKey, newFolderKey) {
    const oldKey = oldFolderKey.endsWith('/') ? oldFolderKey : `${oldFolderKey}/`;
    const newKey = newFolderKey.endsWith('/') ? newFolderKey : `${newFolderKey}/`;
    if (s3Client && config.aws.bucket) {
      try {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: config.aws.bucket,
            Key: newKey,
            Body: Buffer.alloc(0),
          })
        );
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: config.aws.bucket,
            Key: oldKey,
          })
        );
        console.log(`[Storage S3] Renamed folder marker in S3 from ${oldKey} to ${newKey}`);
      } catch (err) {
        console.warn(`[Storage S3 Warning] Could not rename folder marker in S3: ${err.message}`);
      }
    }
  }
}

module.exports = new StorageService();
