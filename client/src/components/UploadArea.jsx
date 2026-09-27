import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  generateFileKey,
  encryptFile,
  wrapFileKeyForRecipient,
} from '../utils/crypto';
import { UploadCloud, File, Lock, CheckCircle, AlertCircle, Loader2, Layers } from 'lucide-react';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunk size (AWS S3 standard multipart minimum)

export default function UploadArea({ onUploadSuccess }) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragOver(true);
    } else if (e.type === 'dragleave') {
      setDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError('');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgressPercent(5);
    setError('');

    try {
      // Step 1: Read file into memory
      setStatusMessage('Reading file in browser memory...');
      const arrayBuffer = await selectedFile.arrayBuffer();
      setProgressPercent(15);

      // Step 2: Generate random 256-bit AES-GCM Key (FEK)
      setStatusMessage('Generating 256-bit AES-GCM encryption key...');
      const fek = await generateFileKey();

      // Step 3: Encrypt entire file content with AES-256-GCM
      setStatusMessage('Encrypting file with AES-256-GCM in client browser...');
      const { encryptedBuffer, iv } = await encryptFile(arrayBuffer, fek);
      setProgressPercent(30);

      // Step 4: Wrap the FEK for the owner using ECDH
      setStatusMessage('Wrapping file key with owner ECDH public key...');
      const wrappedKeyBundle = await wrapFileKeyForRecipient(fek, user.publicKey);
      setProgressPercent(40);

      const totalEncryptedBytes = encryptedBuffer.byteLength;

      // Step 5: Determine upload strategy
      // If file is larger than 5MB, use Multipart Chunked Upload (handles 1GB+)
      if (totalEncryptedBytes > CHUNK_SIZE) {
        setStatusMessage('Initiating S3 Multipart Chunked Upload session...');
        const initRes = await api.files.initiateMultipart({
          originalName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
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

          setStatusMessage(
            `Streaming encrypted Part ${partNumber} of ${totalChunks} to S3 (${(
              (end / totalEncryptedBytes) *
              100
            ).toFixed(0)}%)...`
          );

          const formData = new FormData();
          formData.append('chunk', chunkBlob, `part-${partNumber}.bin`);
          formData.append('uploadId', uploadId);
          formData.append('s3ObjectKey', s3ObjectKey);
          formData.append('partNumber', String(partNumber));

          const partRes = await api.files.uploadChunk(formData);
          uploadedParts.push({
            partNumber: partRes.partNumber,
            etag: partRes.etag,
          });

          const currentPercent = 40 + Math.floor((partNumber / totalChunks) * 50);
          setProgressPercent(currentPercent);
        }

        // Complete S3 Multipart Upload
        setStatusMessage('Finalizing S3 Multipart Upload and committing to database...');
        await api.files.completeMultipart({
          uploadId,
          s3ObjectKey,
          parts: uploadedParts,
          originalName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          encryptedFileKey: wrappedKeyBundle,
          iv,
          encryptedSize: totalEncryptedBytes,
        });
      } else {
        // Single POST upload for smaller files
        setStatusMessage('Uploading encrypted payload to secure vault...');
        const formData = new FormData();
        const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
        formData.append('encryptedFile', encryptedBlob, `${selectedFile.name}.enc`);
        formData.append('originalName', selectedFile.name);
        formData.append('mimeType', selectedFile.type || 'application/octet-stream');
        formData.append('iv', iv);
        formData.append('encryptedFileKey', JSON.stringify(wrappedKeyBundle));

        await api.files.upload(formData);
      }

      setProgressPercent(100);
      setStatusMessage('File encrypted and stored successfully in Amazon S3!');
      setTimeout(() => {
        setSelectedFile(null);
        setUploading(false);
        setProgressPercent(0);
        setStatusMessage('');
        if (onUploadSuccess) onUploadSuccess();
      }, 1000);
    } catch (err) {
      console.error('Upload encryption error:', err);
      setError(err.message || 'File encryption or upload failed');
      setUploading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 mb-8 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-[#f1f5f9] mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#0f172a] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1e40af]" /> Secure File Upload
          </h2>
          <p className="text-xs text-[#64748b]">
            Zero-knowledge <strong>AES-256-GCM</strong> encryption with <strong>S3 Multipart Chunking</strong> for 1GB+ files.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-[#f1f5f9] text-[#475569] px-2 py-1 rounded border border-[#e2e8f0] flex items-center gap-1">
            <Layers className="w-3 h-3 text-[#1e40af]" /> S3 Multipart (1GB+)
          </span>
          <span className="text-xs font-mono bg-[#f1f5f9] text-[#475569] px-2 py-1 rounded border border-[#e2e8f0]">
            Client-Side E2EE
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Drag & Drop Box */}
      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-[#1e40af] bg-blue-50/50'
              : 'border-[#cbd5e1] hover:border-[#94a3b8] bg-[#f8fafc]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 bg-white border border-[#e2e8f0] rounded-full flex items-center justify-center text-[#1e40af] shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="text-sm font-medium text-[#0f172a]">
              <span>Click to select</span> or drag and drop a file
            </div>
            <p className="text-xs text-[#64748b]">
              All file types supported (PDF, archives, media, documents) up to 1GB+.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-[#e2e8f0] rounded-lg p-4 bg-[#f8fafc]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 truncate">
              <div className="p-2 bg-blue-100 text-[#1e40af] rounded">
                <File className="w-5 h-5" />
              </div>
              <div className="truncate">
                <p className="text-sm font-medium text-[#0f172a] truncate">{selectedFile.name}</p>
                <p className="text-xs text-[#64748b]">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Binary file'} •{' '}
                  {selectedFile.size > CHUNK_SIZE ? (
                    <span className="text-[#1e40af] font-medium">S3 Multipart Streaming</span>
                  ) : (
                    <span>Direct Encrypted Post</span>
                  )}
                </p>
              </div>
            </div>

            {!uploading && (
              <button
                onClick={() => setSelectedFile(null)}
                className="text-xs text-[#64748b] hover:text-red-600 transition-colors px-2 py-1"
              >
                Remove
              </button>
            )}
          </div>

          {/* Progress / Status */}
          {uploading && (
            <div className="mt-4 pt-3 border-t border-[#e2e8f0]">
              <div className="flex items-center justify-between text-xs text-[#1e40af] font-medium mb-1.5">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{statusMessage}</span>
                </div>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-[#e2e8f0] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#1e40af] h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!uploading && (
            <div className="mt-4 pt-3 border-t border-[#e2e8f0] flex justify-end space-x-2">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-3 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#cbd5e1] rounded hover:bg-[#f1f5f9]"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="px-4 py-1.5 text-xs font-medium text-white bg-[#1e40af] hover:bg-[#1d4ed8] rounded flex items-center gap-1.5 shadow-xs"
              >
                <Lock className="w-3.5 h-3.5" /> Encrypt & Upload to S3
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
