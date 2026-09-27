import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Download,
  Eye,
  Share2,
  History,
  Trash2,
  Lock,
  Loader2,
  FileCode,
  Image as ImageIcon,
  FileArchive,
  Music,
  Video,
  FileSpreadsheet,
  Edit2,
  GitBranch,
} from 'lucide-react';

export default function FileCard({
  file,
  isSharedView = false,
  onPreview,
  onDownload,
  onShare,
  onAudit,
  onViewVersions,
  onDelete,
  onRename,
  downloading = false,
  deleting = false,
}) {
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(file.originalName || '');
  const renameInputRef = useRef(null);

  useEffect(() => {
    setEditName(file.originalName || '');
  }, [file.originalName]);

  useEffect(() => {
    if (isEditing && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveRename = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editName.trim() || editName.trim() === file.originalName) {
      setIsEditing(false);
      setEditName(file.originalName || '');
      return;
    }
    setIsEditing(false);
    if (onRename) {
      onRename(file.id, editName.trim());
    }
  };

  const name = (file.originalName || '').toLowerCase();
  const mime = (file.mimeType || '').toLowerCase();

  // Helper to determine file type for thumbnail styling
  const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
  const isImage = mime.includes('image') || /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(name);
  const isCode =
    mime.includes('text') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    /\.(txt|json|md|csv|js|jsx|ts|tsx|html|css|py|sql|xml|log|env)$/i.test(name);
  const isSpreadsheet = mime.includes('sheet') || mime.includes('csv') || /\.(xlsx|xls|csv)$/i.test(name);
  const isArchive = mime.includes('zip') || /\.(zip|rar|7z|tar|gz)$/i.test(name);
  const isAudioVideo = mime.includes('audio') || mime.includes('video') || /\.(mp3|wav|mp4|mkv|mov)$/i.test(name);

  // Formatted file size
  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '0 KB';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="bg-white rounded-xl border border-[#cbd5e1] hover:border-[#1e40af] hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group min-h-[300px]"
    >
      {/* Upper Half: Stylized File Thumbnail / Preview Canvas */}
      <div className="h-[145px] bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] p-3 flex flex-col justify-between border-b border-[#e2e8f0] relative overflow-hidden select-none">
        {/* Top Badges Bar */}
        <div className="flex items-center justify-between z-10 w-full">
          {/* Role Badge */}
          {isSharedView ? (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border truncate max-w-[120px] ${
                file.role === 'editor'
                  ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                  : 'bg-blue-100 text-blue-900 border-blue-200'
              }`}
            >
              {file.role === 'editor' ? 'Editor' : 'View Only'}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-200 text-[#0f172a] border border-slate-300">
              {file.role || 'Owner'}
            </span>
          )}

          {/* Version Badge (Clickable to inspect versions) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewVersions) onViewVersions(file);
              else if (onAudit) onAudit(file);
            }}
            title={`Revision v${file.currentVersion || 1} • Click to view Version History & Revisions`}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/95 text-[#1e40af] border border-slate-200 hover:border-[#1e40af] hover:bg-blue-50 shadow-2xs transition-all cursor-pointer flex items-center gap-0.5"
          >
            <span>v{file.currentVersion || 1}</span>
          </button>
        </div>

        {/* Center Thumbnail Representation */}
        <div className="flex-1 flex items-center justify-center my-1 z-0">
          {isPdf ? (
            /* PDF Document Thumbnail representation */
            <div className="w-20 h-24 bg-white rounded border border-red-200 shadow-xs p-1.5 flex flex-col justify-between relative transform group-hover:scale-105 transition-transform">
              <div className="flex items-center justify-between border-b border-red-100 pb-1">
                <span className="text-[9px] font-black text-red-600 tracking-wider">PDF</span>
                <div className="w-2 h-2 bg-red-500 rounded-full opacity-60"></div>
              </div>
              <div className="space-y-1">
                <div className="h-1 bg-slate-200 rounded w-full"></div>
                <div className="h-1 bg-slate-200 rounded w-4/5"></div>
                <div className="h-1 bg-slate-200 rounded w-2/3"></div>
              </div>
              <div className="text-[8px] text-[#94a3b8] font-mono text-right">E2EE</div>
            </div>
          ) : isImage ? (
            /* Image Preview representation */
            <div className="w-24 h-22 rounded border border-blue-200 shadow-xs bg-gradient-to-tr from-blue-100 via-indigo-50 to-emerald-50 flex flex-col items-center justify-center relative p-1 transform group-hover:scale-105 transition-transform">
              <ImageIcon className="w-8 h-8 text-[#1e40af] opacity-80" />
              <span className="text-[9px] font-mono text-[#475569] mt-1 font-semibold uppercase">
                {name.split('.').pop() || 'IMG'}
              </span>
            </div>
          ) : isCode ? (
            /* Code / Text Document representation */
            <div className="w-24 h-22 bg-[#0f172a] rounded border border-slate-700 shadow-xs p-2 flex flex-col justify-between transform group-hover:scale-105 transition-transform">
              <div className="flex items-center space-x-1 border-b border-slate-800 pb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                <span className="text-[8px] text-slate-400 font-mono ml-auto">
                  .{name.split('.').pop()}
                </span>
              </div>
              <div className="space-y-1 font-mono text-[8px] text-emerald-400 opacity-90 overflow-hidden leading-tight">
                <div>&lt;encrypted&gt;</div>
                <div className="text-slate-400 pl-2">fek.unwrap()</div>
                <div>&lt;/vault&gt;</div>
              </div>
            </div>
          ) : isSpreadsheet ? (
            /* Spreadsheet representation */
            <div className="w-20 h-24 bg-white rounded border border-emerald-200 shadow-xs p-1.5 flex flex-col justify-between transform group-hover:scale-105 transition-transform">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-1">
                <span className="text-[9px] font-black text-emerald-700">SHEET</span>
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
              </div>
              <div className="grid grid-cols-3 gap-0.5 my-1">
                <div className="h-2 bg-emerald-50 border border-emerald-100"></div>
                <div className="h-2 bg-emerald-50 border border-emerald-100"></div>
                <div className="h-2 bg-emerald-50 border border-emerald-100"></div>
                <div className="h-2 bg-emerald-50 border border-emerald-100"></div>
                <div className="h-2 bg-emerald-50 border border-emerald-100"></div>
                <div className="h-2 bg-emerald-50 border border-emerald-100"></div>
              </div>
              <div className="text-[8px] text-[#94a3b8] font-mono text-right">AES-256</div>
            </div>
          ) : isArchive ? (
            /* Archive representation */
            <div className="w-20 h-22 bg-amber-50 rounded border border-amber-300 shadow-xs flex flex-col items-center justify-center p-2 transform group-hover:scale-105 transition-transform">
              <FileArchive className="w-8 h-8 text-amber-700 mb-1" />
              <span className="text-[9px] font-mono text-amber-900 font-bold uppercase">
                {name.split('.').pop() || 'ZIP'}
              </span>
            </div>
          ) : isAudioVideo ? (
            /* Audio/Video representation */
            <div className="w-22 h-22 bg-purple-50 rounded border border-purple-200 shadow-xs flex flex-col items-center justify-center p-2 transform group-hover:scale-105 transition-transform">
              <Video className="w-8 h-8 text-purple-700 mb-1" />
              <span className="text-[9px] font-mono text-purple-900 font-bold uppercase">MEDIA</span>
            </div>
          ) : (
            /* Generic File representation */
            <div className="w-20 h-24 bg-white rounded border border-[#cbd5e1] shadow-xs p-2 flex flex-col justify-between transform group-hover:scale-105 transition-transform">
              <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-1">
                <FileText className="w-4 h-4 text-[#1e40af]" />
                <span className="text-[9px] font-mono text-[#64748b] uppercase">
                  {name.split('.').pop() || 'FILE'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="h-1 bg-slate-200 rounded w-full"></div>
                <div className="h-1 bg-slate-200 rounded w-3/4"></div>
              </div>
              <div className="text-[8px] text-[#94a3b8] font-mono text-right">VAULT</div>
            </div>
          )}
        </div>

        {/* Hover Quick Preview Button Overlay */}
        {hovered && (
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex items-center justify-center gap-2 transition-all z-20">
            <button
              onClick={() => onPreview(file)}
              className="px-3 py-1.5 bg-white text-[#0f172a] rounded-lg text-xs font-semibold shadow-md hover:bg-[#f1f5f9] flex items-center gap-1.5 transition-transform hover:scale-105"
            >
              <Eye className="w-3.5 h-3.5 text-[#1e40af]" />
              <span>Preview</span>
            </button>
          </div>
        )}
      </div>

      {/* Lower Half: File Information & Action Toolbar */}
      <div className="p-3.5 flex-1 flex flex-col justify-between bg-white space-y-3">
        {/* Name and Size */}
        <div>
          {isEditing ? (
            <form onSubmit={handleSaveRename} onClick={(e) => e.stopPropagation()}>
              <input
                ref={renameInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveRename}
                className="w-full text-xs font-semibold px-2 py-1 border border-[#1e40af] rounded bg-white text-slate-900 focus:outline-hidden"
              />
            </form>
          ) : (
            <div className="flex items-center justify-between group/title">
              <h4
                className="text-xs font-semibold text-[#0f172a] truncate group-hover:text-[#1e40af] transition-colors flex-1"
                title={file.originalName}
              >
                {file.originalName}
              </h4>
              {file.isOwner && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  title="Rename File"
                  className="opacity-0 group-hover/title:opacity-100 p-1 text-slate-400 hover:text-[#1e40af] transition-opacity"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-[#64748b] mt-1 font-mono">
            <span>{formatSize(file.encryptedSize)}</span>
            <span>{file.createdAt ? new Date(file.createdAt).toLocaleDateString() : 'Active'}</span>
          </div>
          {isSharedView && file.sharedBy && (
            <div className="text-[10px] text-[#94a3b8] truncate mt-0.5">
              Shared by: {file.sharedBy.name || file.sharedBy.email}
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="pt-2 border-t border-[#f1f5f9] flex items-center justify-between">
          <div className="flex items-center space-x-1">
            {/* Decrypt & Preview */}
            <button
              onClick={() => onPreview(file)}
              title="Decrypt & Preview"
              className="p-1.5 text-[#475569] hover:text-[#1e40af] hover:bg-[#f1f5f9] rounded transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {/* Rename (Owner only) */}
            {file.isOwner && (
              <button
                onClick={() => setIsEditing(true)}
                title="Rename File"
                className="p-1.5 text-[#475569] hover:text-[#1e40af] hover:bg-[#f1f5f9] rounded transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Decrypt & Download (Restricted from Viewer) */}
            {file.role !== 'viewer' && (
              <button
                onClick={() => onDownload(file)}
                disabled={downloading}
                title="Decrypt & Download Plaintext"
                className="p-1.5 text-[#475569] hover:text-[#1e40af] hover:bg-[#f1f5f9] rounded transition-colors disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1e40af]" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {/* Share (Owner only) */}
            {file.isOwner && (
              <button
                onClick={() => onShare(file)}
                title="Share Access & Generate Links"
                className="p-1.5 text-[#475569] hover:text-[#1e40af] hover:bg-[#f1f5f9] rounded transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Version History */}
            <button
              onClick={() => {
                if (onViewVersions) onViewVersions(file);
                else onAudit(file);
              }}
              title="View Version History & Historical Revisions"
              className="p-1.5 text-[#475569] hover:text-[#1e40af] hover:bg-[#f1f5f9] rounded transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>

            {/* Audit Logs */}
            <button
              onClick={() => onAudit(file)}
              title="View Cryptographic Audit Trail"
              className="p-1.5 text-[#475569] hover:text-[#1e40af] hover:bg-[#f1f5f9] rounded transition-colors"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Delete (Owner only) */}
          {file.isOwner && (
            <button
              onClick={() => onDelete(file)}
              disabled={deleting}
              title="Delete File"
              className="p-1.5 text-[#94a3b8] hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
