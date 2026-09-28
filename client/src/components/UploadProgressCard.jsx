import React from 'react';
import {
  UploadCloud,
  FileText,
  Folder as FolderIcon,
  AlertCircle,
  X,
  Loader2,
  CheckCircle,
  ShieldAlert,
} from 'lucide-react';

/**
 * UploadProgressCard - An in-progress Card/Box rendered inside the Vault Files section
 * Features a visual "fill-up" progress animation as the file is encrypted & uploaded to S3.
 */
export default function UploadProgressCard({ upload, onDismiss }) {
  if (!upload) return null;

  const progress = Math.min(100, Math.max(0, upload.progress || 0));
  const isFolder = upload.type === 'folder';

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div
      className={`relative p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[175px] overflow-hidden select-none ${
        upload.isFailed
          ? 'bg-red-50/70 border-red-300 ring-2 ring-red-100 shadow-xs'
          : upload.isCompleted
          ? 'bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-100 shadow-sm'
          : 'bg-white border-blue-300 ring-2 ring-blue-100 shadow-md'
      }`}
    >
      {/* Visual Box Fill Animation: Background fills up from bottom to top as upload progresses */}
      {!upload.isFailed && !upload.isCompleted && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-blue-500/10 border-t border-blue-400/30 transition-all duration-300 pointer-events-none"
          style={{ height: `${progress}%` }}
        />
      )}

      {/* Shimmer / Wave effect across the box while uploading */}
      {!upload.isFailed && !upload.isCompleted && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200/20 to-transparent -translate-x-full animate-pulse pointer-events-none" />
      )}

      {/* Top Header Row */}
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className={`p-2.5 rounded-xl flex items-center justify-center shrink-0 ${
              upload.isFailed
                ? 'bg-red-100 text-red-600'
                : upload.isCompleted
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-blue-100 text-blue-700 animate-pulse'
            }`}
          >
            {upload.isFailed ? (
              <AlertCircle className="w-5 h-5" />
            ) : upload.isCompleted ? (
              <CheckCircle className="w-5 h-5" />
            ) : isFolder ? (
              <FolderIcon className="w-5 h-5" />
            ) : (
              <UploadCloud className="w-5 h-5 animate-bounce" />
            )}
          </div>

          <div className="max-w-[130px] sm:max-w-[150px]">
            <span
              className="text-xs font-bold text-slate-900 block truncate"
              title={upload.name}
            >
              {upload.name}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {formatBytes(upload.size)}
            </span>
          </div>
        </div>

        {/* Progress or Status Badge */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {upload.isFailed ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700">
              Failed
            </span>
          ) : upload.isCompleted ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Done
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
              {progress}%
            </span>
          )}

          {upload.isFailed && onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(upload.id)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Middle Status / Action Text */}
      <div className="relative z-10 my-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          {!upload.isFailed && !upload.isCompleted && (
            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
          )}
          <span className="text-[11px] truncate text-slate-600">
            {upload.isFailed
              ? upload.error || 'Upload could not be completed'
              : upload.isCompleted
              ? 'Zero-Knowledge Encrypted & Stored'
              : upload.status || 'Encrypting & streaming to S3...'}
          </span>
        </div>
      </div>

      {/* Bottom Progress Bar Line */}
      <div className="relative z-10 space-y-1">
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              upload.isFailed
                ? 'bg-red-500'
                : upload.isCompleted
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{isFolder ? 'Folder Bundle' : 'AES-256-GCM'}</span>
          <span className="font-mono font-medium text-slate-600">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
