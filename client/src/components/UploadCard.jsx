import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { uploadEncryptedFile } from '../services/uploadService';
import { UploadCloud, Loader2, ShieldCheck, AlertCircle, Plus } from 'lucide-react';

export default function UploadCard({
  onUploadSuccess,
  onRequireAuth,
  customTitle = 'Upload New File',
  customSubtitle = 'Drag and drop or click to browse',
}) {
  const { user, isAuthenticated } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleClick = () => {
    if (!isAuthenticated) {
      if (onRequireAuth) {
        onRequireAuth();
        return;
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

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

    if (!isAuthenticated) {
      if (onRequireAuth) onRequireAuth();
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processUpload(e.target.files[0]);
    }
  };

  const processUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setProgress(5);
    setError('');

    try {
      await uploadEncryptedFile({
        file,
        user,
        onProgress: setProgress,
        onStatus: setStatusText,
      });

      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      console.error('Card upload failed:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
      setStatusText('');
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer min-h-[300px] flex flex-col items-center justify-center p-6 text-center group relative select-none ${
        dragOver
          ? 'border-[#1e40af] bg-blue-50/80 shadow-md scale-[1.01]'
          : 'border-[#cbd5e1] hover:border-[#1e40af] bg-[#f8fafc]/60 hover:bg-blue-50/30 hover:shadow-md'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {uploading ? (
        <div className="w-full space-y-3 px-2">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-[#1e40af] mx-auto animate-pulse">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-[#0f172a]">Encrypting & Uploading</h4>
            <p className="text-[11px] text-[#64748b] truncate">{statusText || 'Processing...'}</p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#e2e8f0] rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#1e40af] h-2 transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="text-[10px] font-mono text-[#1e40af] font-semibold">{progress}%</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-3">
          {/* Circular Upload Icon */}
          <div className="w-14 h-14 rounded-full bg-blue-100/70 group-hover:bg-[#1e40af] text-[#1e40af] group-hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs group-hover:scale-105">
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#0f172a] group-hover:text-[#1e40af] transition-colors">
              {customTitle}
            </h4>
            <p className="text-[11px] text-[#64748b] max-w-[180px] leading-tight">
              {customSubtitle}
            </p>
          </div>

          {/* Security & Capability Badge */}
          <div className="pt-2 flex flex-col items-center gap-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white border border-[#cbd5e1] text-[#475569] shadow-xs">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>AES-256 Client E2EE</span>
            </span>
            <span className="text-[10px] font-mono text-[#94a3b8]">
              S3 Chunked (1GB+)
            </span>
          </div>

          {error && (
            <div className="mt-2 p-1.5 bg-red-50 border border-red-200 text-red-700 text-[10px] rounded flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[180px]">{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
