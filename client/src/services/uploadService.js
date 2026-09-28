import { api } from './api';
import {
  generateFileKey,
  encryptFile,
  wrapFileKeyForRecipient,
  generateFileSearchTokens,
} from '../utils/crypto';

const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB chunk size (AWS S3 standard multipart minimum is 5MB)
const MULTIPART_CONCURRENCY = 4; // 4 concurrent streams directly into Amazon S3

/**
 * Encrypt and upload file to SecureVault with automatic high-performance S3 Multipart chunking for 1GB+ files.
 * Supports multipart session recovery, concurrent S3 part streaming, and zero-copy memory management.
 */
export async function uploadEncryptedFile({
  file,
  user,
  folderId = null,
  existingSession = null,
  onInitSession = () => {},
  onPartUploaded = () => {},
  onProgress = () => {},
  onStatus = () => {},
  abortSignal = null,
}) {
  if (!file) throw new Error('No file provided for upload');
  let activePublicKey = user?.publicKey;
  if (!activePublicKey) {
    try {
      const meRes = await api.auth.getMe();
      if (meRes.user?.publicKey) {
        activePublicKey = meRes.user.publicKey;
        const savedUserStr = localStorage.getItem('securevault_user');
        if (savedUserStr) {
          const parsed = JSON.parse(savedUserStr);
          parsed.publicKey = activePublicKey;
          localStorage.setItem('securevault_user', JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.warn('Could not auto-fetch user public key:', e);
    }
  }

  if (!activePublicKey) {
    throw new Error('Active user account with ECDH public key is required for encryption. Please re-login.');
  }

  // Step 1: Read file into memory
  onStatus(`Reading "${file.name}" in browser memory...`);
  onProgress(10);
  let arrayBuffer = await file.arrayBuffer();

  if (abortSignal && abortSignal.aborted) {
    throw new Error('Upload cancelled by user.');
  }

  // Step 2: Generate random 256-bit AES-GCM Key (FEK)
  onStatus('Generating AES-256-GCM encryption key...');
  onProgress(20);
  const fek = await generateFileKey();

  // Step 3: Encrypt file content with AES-256-GCM
  onStatus('Encrypting payload in browser with AES-256-GCM...');
  onProgress(30);
  const { encryptedBuffer, iv } = await encryptFile(arrayBuffer, fek);
  arrayBuffer = null; // Free unencrypted raw buffer immediately

  if (abortSignal && abortSignal.aborted) {
    throw new Error('Upload cancelled by user.');
  }

  // Step 4: Wrap the FEK for the owner using ECDH
  onStatus('Wrapping file key with owner ECDH public key...');
  onProgress(35);
  const wrappedKeyBundle = await wrapFileKeyForRecipient(fek, activePublicKey);

  const totalEncryptedBytes = encryptedBuffer.byteLength;
  const searchTokens = await generateFileSearchTokens(file.name);

  // Convert to high-performance Blob and free raw Uint8Array from JavaScript heap
  const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });

  // Step 5: High-Performance Multipart chunked upload (if > 6MB)
  if (totalEncryptedBytes > CHUNK_SIZE) {
    let uploadId = existingSession?.uploadId;
    let s3ObjectKey = existingSession?.s3ObjectKey;

    if (!uploadId || !s3ObjectKey) {
      onStatus('Initiating Amazon S3 Multipart Upload session...');
      const initRes = await api.files.initiateMultipart({
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      uploadId = initRes.uploadId;
      s3ObjectKey = initRes.s3ObjectKey;

      if (onInitSession) {
        onInitSession({
          uploadId,
          s3ObjectKey,
          iv,
          wrappedKeyBundle,
          totalEncryptedBytes,
        });
      }
    }

    const totalChunks = Math.ceil(totalEncryptedBytes / CHUNK_SIZE);
    // Recover any already-uploaded parts if resuming
    const uploadedPartsMap = new Map();
    if (existingSession?.uploadedParts && Array.isArray(existingSession.uploadedParts)) {
      for (const p of existingSession.uploadedParts) {
        uploadedPartsMap.set(Number(p.partNumber), p.etag);
      }
    }

    let completedChunks = uploadedPartsMap.size;
    let nextChunkIndex = 0;

    onStatus(
      completedChunks > 0
        ? `Resuming Amazon S3 upload: ${completedChunks}/${totalChunks} parts already verified...`
        : `Streaming ${totalChunks} encrypted chunks directly to Amazon S3 (4x concurrency)...`
    );

    // Concurrent worker pool streaming directly into S3
    const uploadWorker = async (workerId) => {
      while (nextChunkIndex < totalChunks) {
        if (abortSignal && abortSignal.aborted) {
          try {
            await api.files.abortMultipart({ uploadId, s3ObjectKey });
          } catch (_) {}
          throw new Error('Upload cancelled by user.');
        }

        const partNum = ++nextChunkIndex;
        if (partNum > totalChunks) break;

        // Skip if this part was already uploaded in a previous session
        if (uploadedPartsMap.has(partNum)) {
          continue;
        }

        const start = (partNum - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalEncryptedBytes);
        // Zero-copy slice directly from native Blob
        const chunkBlob = encryptedBlob.slice(start, end, 'application/octet-stream');

        // Retry loop up to 3 times with exponential backoff
        let partRes = null;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const chunkFormData = new FormData();
            chunkFormData.append('uploadId', uploadId);
            chunkFormData.append('s3ObjectKey', s3ObjectKey);
            chunkFormData.append('partNumber', partNum.toString());
            chunkFormData.append('chunk', chunkBlob, `part-${partNum}.bin`);

            partRes = await api.files.uploadChunk(chunkFormData);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            }
          }
        }

        if (lastErr) {
          throw new Error(`Failed streaming Part ${partNum} to S3: ${lastErr.message}`);
        }

        uploadedPartsMap.set(partNum, partRes.etag);
        completedChunks++;

        const currentPartsArray = Array.from(uploadedPartsMap.entries()).map(([num, tag]) => ({
          partNumber: num,
          etag: tag,
        }));

        if (onPartUploaded) {
          onPartUploaded({ partNumber: partNum, etag: partRes.etag }, currentPartsArray);
        }

        const pct = 35 + Math.round((completedChunks / totalChunks) * 60);
        const uploadedMB = ((completedChunks * CHUNK_SIZE) / (1024 * 1024)).toFixed(1);
        const totalMB = (totalEncryptedBytes / (1024 * 1024)).toFixed(1);

        onProgress(pct);
        onStatus(`Streaming to S3: ${completedChunks}/${totalChunks} parts (${uploadedMB} MB / ${totalMB} MB)...`);
      }
    };

    // Execute 4 concurrent streams directly into Amazon S3
    const concurrency = Math.min(MULTIPART_CONCURRENCY, totalChunks);
    const activeWorkers = Array.from({ length: concurrency }, (_, wId) => uploadWorker(wId));

    await Promise.all(activeWorkers);

    onStatus('Finalizing Amazon S3 Multipart Upload and assembling encrypted file...');
    // AWS S3 requires parts array to be sorted by PartNumber ascending
    const sortedParts = Array.from(uploadedPartsMap.entries())
      .map(([num, tag]) => ({ partNumber: num, etag: tag }))
      .sort((a, b) => a.partNumber - b.partNumber);

    const completeRes = await api.files.completeMultipart({
      uploadId,
      s3ObjectKey,
      parts: sortedParts,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      encryptedFileKey: wrappedKeyBundle,
      iv,
      encryptedSize: totalEncryptedBytes,
      folderId: folderId || null,
      searchTokens,
    });

    onProgress(100);
    onStatus('File encrypted and stored securely in Amazon S3!');
    return completeRes;
  }

  // Single upload for files <= 6MB
  onStatus('Uploading encrypted ciphertext to vault storage...');
  onProgress(60);

  const formData = new FormData();
  formData.append('encryptedFile', encryptedBlob, `${file.name}.enc`);
  formData.append('originalName', file.name);
  formData.append('mimeType', file.type || 'application/octet-stream');
  formData.append('encryptedSize', totalEncryptedBytes.toString());
  formData.append('iv', iv);
  formData.append('encryptedFileKey', JSON.stringify(wrappedKeyBundle));
  formData.append('searchTokens', JSON.stringify(searchTokens));
  if (folderId) {
    formData.append('folderId', folderId);
  }

  const response = await api.files.upload(formData);
  onProgress(100);
  onStatus('File encrypted and stored securely in vault!');
  return response;
}
