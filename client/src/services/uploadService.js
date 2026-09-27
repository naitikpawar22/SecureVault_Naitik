import { api } from './api';
import {
  generateFileKey,
  encryptFile,
  wrapFileKeyForRecipient,
} from '../utils/crypto';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunk size (AWS S3 standard multipart minimum)

/**
 * Encrypt and upload file to SecureVault with automatic S3 Multipart chunking for 1GB+ files.
 */
export async function uploadEncryptedFile({
  file,
  user,
  folderId = null,
  onProgress = () => {},
  onStatus = () => {},
}) {
  if (!file) throw new Error('No file provided for upload');
  if (!user || !user.publicKey) {
    throw new Error('Active user account with ECDH public key is required for encryption');
  }

  // Step 1: Read file into memory
  onStatus('Reading file in browser memory...');
  onProgress(10);
  const arrayBuffer = await file.arrayBuffer();

  // Step 2: Generate random 256-bit AES-GCM Key (FEK)
  onStatus('Generating AES-256-GCM encryption key...');
  onProgress(20);
  const fek = await generateFileKey();

  // Step 3: Encrypt file content with AES-256-GCM
  onStatus('Encrypting file in browser with AES-256-GCM...');
  onProgress(35);
  const { encryptedBuffer, iv } = await encryptFile(arrayBuffer, fek);

  // Step 4: Wrap the FEK for the owner using ECDH
  onStatus('Wrapping file key with owner ECDH public key...');
  onProgress(45);
  const wrappedKeyBundle = await wrapFileKeyForRecipient(fek, user.publicKey);

  const totalEncryptedBytes = encryptedBuffer.byteLength;

  // Step 5: Multipart chunked upload (if > 5MB)
  if (totalEncryptedBytes > CHUNK_SIZE) {
    onStatus('Initiating S3 Multipart Upload session...');
    const initRes = await api.files.initiateMultipart({
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
    });

    const { uploadId, s3ObjectKey } = initRes;
    const totalChunks = Math.ceil(totalEncryptedBytes / CHUNK_SIZE);
    const uploadedParts = [];

    for (let partNumber = 1; partNumber <= totalChunks; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalEncryptedBytes);
      const chunkBlob = new Blob([encryptedBuffer.slice(start, end)], {
        type: 'application/octet-stream',
      });

      onStatus(
        `Streaming encrypted Part ${partNumber} of ${totalChunks} to S3 (${(
          (end - start) /
          (1024 * 1024)
        ).toFixed(1)} MB)...`
      );

      const chunkFormData = new FormData();
      chunkFormData.append('uploadId', uploadId);
      chunkFormData.append('s3ObjectKey', s3ObjectKey);
      chunkFormData.append('partNumber', partNumber.toString());
      chunkFormData.append('chunk', chunkBlob, `part-${partNumber}.bin`);

      const partRes = await api.files.uploadChunk(chunkFormData);
      uploadedParts.push({
        partNumber: partRes.partNumber,
        etag: partRes.etag,
      });

      const chunkProgress = 45 + Math.round((partNumber / totalChunks) * 50);
      onProgress(chunkProgress);
    }

    onStatus('Finalizing S3 Multipart Upload and assembling encrypted file...');
    const completeRes = await api.files.completeMultipart({
      uploadId,
      s3ObjectKey,
      parts: uploadedParts,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      encryptedFileKey: wrappedKeyBundle,
      iv,
      encryptedSize: totalEncryptedBytes,
      folderId: folderId || null,
    });

    onProgress(100);
    onStatus('File encrypted and stored securely in Amazon S3!');
    return completeRes;
  }

  // Single upload for files <= 5MB
  onStatus('Uploading encrypted ciphertext to vault storage...');
  onProgress(60);

  const encryptedBlob = new Blob([encryptedBuffer], {
    type: 'application/octet-stream',
  });

  const formData = new FormData();
  formData.append('encryptedFile', encryptedBlob, `${file.name}.enc`);
  formData.append('originalName', file.name);
  formData.append('mimeType', file.type || 'application/octet-stream');
  formData.append('encryptedSize', totalEncryptedBytes.toString());
  formData.append('iv', iv);
  formData.append('encryptedFileKey', JSON.stringify(wrappedKeyBundle));
  if (folderId) {
    formData.append('folderId', folderId);
  }

  const response = await api.files.upload(formData);
  onProgress(100);
  onStatus('File encrypted and stored securely in vault!');
  return response;
}
