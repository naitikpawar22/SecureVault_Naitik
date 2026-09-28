import React, { useState } from 'react';
import {
  UploadCloud,
  CheckCircle,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder as FolderIcon,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

/**
 * Floating Upload Progress Widget anchored at the bottom-right corner of the page.
 * Displays overall & per-item upload progress, live encryption steps, and progress line.
 */
export default function UploadCornerWidget({ uploads = [], onDismiss, onDismissAll }) {
  const [minimized, setMinimized] = useState(false);

  if (!uploads || uploads.length === 0) return null;

  const activeCount = uploads.filter((u) => !u.isCompleted && !u.isFailed).length;
  const completedCount = uploads.filter((u) => u.isCompleted).length;
  const failedCount = uploads.filter((u) => u.isFailed).length;
  const currentUpload = uploads.find((u) => !u.isCompleted && !u.isFailed) || uploads[uploads.length - 1];

  const overallProgress = Math.round(
    uploads.reduce((acc, u) => acc + (u.progress || 0), 0) / uploads.length
  );

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <aside
      aria-label="Upload Progress"
      className="fixed bottom-5 right-5 z-50 w-84 sm:w-96 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-5 duration-200 text-slate-900"
    >
      {/* Widget Header */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {activeCount > 0 ? (
            <div className="relative">
              <UploadCloud className="w-4 h-4 text-blue-400 animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            </div>
          ) : failedCount > 0 ? (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}

          <div>
            <h4 className="text-xs font-bold tracking-tight">
              {activeCount > 0
                ? `Uploading ${activeCount} ${activeCount === 1 ? 'item' : 'items'}...`
                : failedCount > 0
                ? 'Upload Completed with Errors'
                : 'All Uploads Encrypted & Complete'}
            </h4>
            <span className="text-[10px] text-slate-400 block font-mono">
              {completedCount}/{uploads.length} completed
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setMinimized(!minimized)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {onDismissAll && (
            <button
              type="button"
              onClick={onDismissAll}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Progress Line along top border of body */}
      <div className="w-full bg-slate-100 h-1.5 overflow-hidden relative">
        <div
          className={`h-full transition-all duration-300 ${
            failedCount > 0 && activeCount === 0
              ? 'bg-amber-500'
              : overallProgress >= 100
              ? 'bg-emerald-500'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500'
          }`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Widget Body (if not minimized) */}
      {!minimized && (
        <div className="p-3.5 space-y-3 max-h-60 overflow-y-auto divide-y divide-slate-100">
          {uploads.map((upload) => (
            <div key={upload.id} className="pt-2 first:pt-0 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 truncate max-w-[210px] sm:max-w-[240px]">
                  {upload.type === 'folder' ? (
                    <FolderIcon className="w-4 h-4 text-blue-600 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-800 truncate" title={upload.name}>
                    {upload.name}
                  </span>
                </div>

                <div className="text-right shrink-0">
                  {upload.isFailed ? (
                    <span className="text-[10px] font-bold text-red-600">Failed</span>
                  ) : upload.isCompleted ? (
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Done
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono font-bold text-blue-700">
                      {upload.progress || 0}%
                    </span>
                  )}
                </div>
              </div>

              {/* Status and Size Detail */}
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="truncate max-w-[220px] text-blue-900 font-medium">
                  {upload.isFailed
                    ? upload.error || 'Upload failed'
                    : upload.isCompleted
                    ? 'Encrypted with AES-256-GCM & stored in S3'
                    : upload.status || 'Encrypting & uploading...'}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {formatBytes(upload.size)}
                </span>
              </div>

              {/* Item Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    upload.isFailed
                      ? 'bg-red-500'
                      : upload.isCompleted
                      ? 'bg-emerald-500'
                      : 'bg-[#1e40af]'
                  }`}
                  style={{ width: `${upload.progress || 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Footer Info */}
      <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>Client-side Zero-Knowledge Encryption</span>
        </span>
        <span className="font-mono font-bold text-blue-700">{overallProgress}%</span>
      </div>
    </aside>
  );
}
