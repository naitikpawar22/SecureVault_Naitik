import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { unwrapFileKey, decryptFile } from '../utils/crypto';
import {
  FileText,
  Download,
  Eye,
  Share2,
  History,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  LayoutGrid,
  List,
  Folder as FolderIcon,
  ChevronRight,
  Home,
  Plus,
  Edit2,
  GitBranch,
  Link as LinkIcon,
  Users,
  Upload,
  FolderUp,
  UploadCloud,
} from 'lucide-react';
import PreviewModal from './PreviewModal';
import ShareModal from './ShareModal';
import AuditModal from './AuditModal';
import UnlockModal from './UnlockModal';
import FileCard from './FileCard';
import FolderCard from './FolderCard';
import NewMenuButton from './NewMenuButton';
import FolderShareModal from './FolderShareModal';
import GenerateLinkModal from './GenerateLinkModal';
import ManageAccessModal from './ManageAccessModal';
import VersionHistoryModal from './VersionHistoryModal';
import UploadProgressCard from './UploadProgressCard';

export default function FileList({
  files = [],
  folders = [],
  breadcrumbs = [],
  currentFolderId = null,
  currentFolderName = null,
  isSharedView = false,
  activeUploads = [],
  onDismissUpload,
  onRefresh,
  onOpenFolder,
  onNavigateBreadcrumb,
  onNewFolder,
  onFileUpload,
  onFolderUpload,
  onRenameFolder,
  onDeleteFolder,
}) {
  const { privateKey } = useAuth();
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [showUnlockModal, setShowUnlockModal] = useState(false);


  // Modals state
  const [previewFile, setPreviewFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [sharingFolder, setSharingFolder] = useState(null);
  const [auditFile, setAuditFile] = useState(null);
  const [auditInitialTab, setAuditInitialTab] = useState('audit');
  const [generateLinkItem, setGenerateLinkItem] = useState(null);
  const [manageAccessItem, setManageAccessItem] = useState(null);
  const [versionHistoryFile, setVersionHistoryFile] = useState(null);
  const [versionCryptoKey, setVersionCryptoKey] = useState(null);

  const handleOpenVersions = async (file) => {
    setVersionHistoryFile(file);
    if (file.wrappedFileKey && privateKey) {
      try {
        const k = await unwrapFileKey(file.wrappedFileKey, privateKey);
        setVersionCryptoKey(k);
      } catch (e) {
        console.warn('Could not unwrap key for version modal:', e);
      }
    }
  };

  const handleOpenAudit = (file) => {
    setAuditInitialTab('audit');
    setAuditFile(file);
  };

  const handleRenameFile = async (fileId, newName) => {
    try {
      await api.files.rename(fileId, newName);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to rename file');
    }
  };

  /**
   * Zero-Knowledge Decryption & Download in Browser
   */
  const handleDownload = async (file) => {
    // Check if downloading is restricted by the owner
    if (file.allowDownload === false) {
      alert('Downloading is disabled for this item by the owner. You can view it in protected preview mode.');
      return;
    }

    if (!privateKey) {
      setShowUnlockModal(true);
      return;
    }

    setDownloadingId(file.id);
    setError('');

    try {
      // 1. Fetch file record to get the user's wrapped file key
      const meta = await api.files.get(file.id);
      const wrappedKeyBundle = meta.file?.wrappedFileKey || file.wrappedFileKey;
      const iv = meta.file?.iv || file.iv;

      if (!wrappedKeyBundle) {
        throw new Error('Encryption key is not available for your account. Please ask the owner to update permissions for this item.');
      }

      // 2. Fetch encrypted binary from server
      const { blob } = await api.files.download(file.id);
      const encryptedBuffer = await blob.arrayBuffer();

      // 3. Unwrap FEK with client's ECDH private key
      const fek = await unwrapFileKey(wrappedKeyBundle, privateKey);

      // 4. Decrypt in browser memory with AES-256-GCM
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, iv);

      // 5. Trigger browser download of plaintext file
      const decryptedBlob = new Blob([decryptedBuffer], {
        type: file.mimeType || 'application/octet-stream',
      });
      const downloadUrl = URL.createObjectURL(decryptedBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Download decryption error:', err);
      if (err.name === 'OperationError' || err.message?.includes('OperationError')) {
        setError('Decryption failed: Key mismatch. Please ask the owner to re-grant or update access so your encryption key is properly renewed.');
      } else {
        setError(`Decryption failed: ${err.message}`);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (file) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${file.originalName}"?`)) {
      return;
    }

    setDeletingId(file.id);
    setError('');
    try {
      await api.files.delete(file.id);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to delete file');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateFolderSubmit = async (folderName) => {
    if (onNewFolder) {
      await onNewFolder(folderName);
    } else {
      await api.folders.create({
        name: folderName,
        parentId: currentFolderId,
      });
      if (onRefresh) onRefresh();
    }
  };

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const emptyFileInputRef = useRef(null);
  const emptyFolderInputRef = useRef(null);

  // Helper to read directory entries recursively for folder drag & drop
  const readDirectoryRecursively = async (dirEntry) => {
    const fileList = [];

    async function traverse(entry, parentPath = '') {
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file(
            (file) => {
              const relativePath = parentPath ? `${parentPath}/${file.name}` : `${dirEntry.name}/${file.name}`;
              try {
                Object.defineProperty(file, 'webkitRelativePath', {
                  value: relativePath,
                  writable: false,
                });
              } catch (e) {
                file.relativePath = relativePath;
              }
              fileList.push(file);
              resolve();
            },
            () => resolve()
          );
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readBatch = async () => {
          const results = [];
          while (true) {
            const batch = await new Promise((resolve) => {
              dirReader.readEntries(
                (entries) => resolve(entries),
                () => resolve([])
              );
            });
            if (!batch.length) break;
            results.push(...batch);
          }
          return results;
        };

        const children = await readBatch();
        const nextPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        for (const child of children) {
          await traverse(child, nextPath);
        }
      }
    }

    await traverse(dirEntry);
    return fileList;
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDraggingOver(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounter.current = 0;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onFileUpload) {
        onFileUpload(e.dataTransfer.files);
      }
      return;
    }

    const filesToUpload = [];
    const folderEntries = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry && entry.isDirectory) {
          folderEntries.push(entry);
        } else {
          const file = item.getAsFile();
          if (file) filesToUpload.push(file);
        }
      }
    }

    if (filesToUpload.length > 0 && onFileUpload) {
      onFileUpload(filesToUpload);
    }

    if (folderEntries.length > 0 && onFolderUpload) {
      for (const dirEntry of folderEntries) {
        const dirFiles = await readDirectoryRecursively(dirEntry);
        if (dirFiles.length > 0) {
          onFolderUpload(dirFiles);
        }
      }
    }
  };

  const activeFolderUploads = (activeUploads || []).filter((u) => u.type === 'folder');
  const activeFileUploads = (activeUploads || []).filter((u) => u.type !== 'folder');
  const hasItems =
    (folders && folders.length > 0) ||
    (files && files.length > 0) ||
    (activeUploads && activeUploads.length > 0);

  return (
    <div
      className="relative space-y-4 min-h-[420px]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file & folder inputs for fallback buttons */}
      <input
        type="file"
        ref={emptyFileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && onFileUpload) {
            onFileUpload(e.target.files);
            e.target.value = '';
          }
        }}
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={emptyFolderInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && onFolderUpload) {
            onFolderUpload(e.target.files);
            e.target.value = '';
          }
        }}
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 bg-blue-600/10 backdrop-blur-2xs border-2 border-dashed border-[#1e40af] rounded-2xl flex flex-col items-center justify-center p-8 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
          <div className="p-5 bg-white/95 rounded-2xl shadow-2xl flex flex-col items-center text-center space-y-3 max-w-md border border-blue-200">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#1e40af] flex items-center justify-center shadow-inner animate-bounce">
              <UploadCloud className="w-8 h-8 stroke-[2.2]" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Drop Files or Folders Here</h4>
              <p className="text-xs text-slate-600 mt-1">
                Release anywhere to automatically encrypt with AES-256-GCM and store in your Vault
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero-Knowledge E2EE Encrypted</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Controls & Breadcrumbs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border-2 border-slate-300 p-3.5 rounded-2xl shadow-xs">
        {/* Left Side: + New Button & Breadcrumb Navigation */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {!isSharedView && (
            <NewMenuButton
              onNewFolder={onNewFolder}
              onFileUpload={onFileUpload}
              onFolderUpload={onFolderUpload}
              enableShortcuts={false}
            />
          )}

          <nav className="flex items-center space-x-1.5 text-xs text-slate-700 pl-1 font-bold">
            <button
              type="button"
              onClick={() => onNavigateBreadcrumb && onNavigateBreadcrumb(null)}
              className="flex items-center gap-1.5 font-bold text-slate-900 hover:text-[#1e40af] hover:underline"
            >
              <Home className="w-4 h-4 text-slate-700" />
              <span>{isSharedView ? 'Shared Files' : 'Vault Files'}</span>
            </button>

            {breadcrumbs && breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || idx}>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 stroke-[2.5]" />
                <button
                  type="button"
                  onClick={() => onNavigateBreadcrumb && onNavigateBreadcrumb(crumb.id)}
                  className={`truncate max-w-[140px] hover:underline ${
                    idx === breadcrumbs.length - 1
                      ? 'font-bold text-[#1e40af]'
                      : 'font-bold text-slate-800 hover:text-slate-900'
                  }`}
                  title={crumb.name}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Right Side: View Mode Toggle & Total Count */}
        <div className="flex items-center space-x-3 self-end sm:self-auto">
          <span className="text-xs font-bold text-slate-800 font-mono bg-slate-100 px-3 py-1 rounded-xl border border-slate-300 shadow-2xs">
            {folders.length > 0 && `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}, `}
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>

          {/* Grid vs Table View Toggle */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold ${
                viewMode === 'grid'
                  ? 'bg-white text-[#1e40af] shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Grid View (4 Cards per Row)"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-bold">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 font-bold ${
                viewMode === 'table'
                  ? 'bg-white text-[#1e40af] shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Table List View"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-bold">Table</span>
            </button>
          </div>
        </div>
      </div>


      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* VIEW MODE 1: Modern 4-Cards-per-Row Grid (Directly starting with Folders & Files, no Col 1 upload box) */}
      {viewMode === 'grid' ? (
        <div className="space-y-6">
          {/* Folders Section (if any folders or ongoing folder uploads) */}
          {((folders && folders.length > 0) || activeFolderUploads.length > 0) && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <FolderIcon className="w-4 h-4 text-blue-600" />
                <span>Folders ({folders.length + activeFolderUploads.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {activeFolderUploads.map((upload) => (
                  <UploadProgressCard
                    key={upload.id}
                    upload={upload}
                    onDismiss={onDismissUpload}
                  />
                ))}
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onOpen={onOpenFolder}
                    onRename={onRenameFolder}
                    onDelete={onDeleteFolder}
                    onShare={(f) => setSharingFolder(f)}
                    onGenerateLink={(f) => setGenerateLinkItem({ type: 'folder', id: f.id, name: f.name })}
                    onManageAccess={(f) => setManageAccessItem({ type: 'folder', id: f.id, name: f.name })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Files Section (4 cards per row, including ongoing file uploads) */}
          {((files && files.length > 0) || activeFileUploads.length > 0) && (
            <div className="space-y-2">
              {((folders && folders.length > 0) || activeFolderUploads.length > 0) && (
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>Files ({files.length + activeFileUploads.length})</span>
                </h3>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {activeFileUploads.map((upload) => (
                  <UploadProgressCard
                    key={upload.id}
                    upload={upload}
                    onDismiss={onDismissUpload}
                  />
                ))}
                {files.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    isSharedView={isSharedView}
                    onPreview={setPreviewFile}
                    onDownload={handleDownload}
                    onShare={setShareFile}
                    onGenerateLink={(f) => setGenerateLinkItem({ type: 'file', id: f.id, name: f.originalName })}
                    onManageAccess={(f) => setManageAccessItem({ type: 'file', id: f.id, name: f.originalName })}
                    onAudit={handleOpenAudit}
                    onViewVersions={handleOpenVersions}
                    onDelete={handleDelete}
                    onRename={handleRenameFile}
                    downloading={downloadingId === file.id}
                    deleting={deletingId === file.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state if no folders and no files */}
          {!hasItems && (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 text-[#1e40af] flex items-center justify-center mx-auto border-2 border-blue-200">
                <FileText className="w-8 h-8 opacity-90 stroke-[2.2]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {currentFolderName ? `"${currentFolderName}" is empty` : 'Your vault is empty'}
                </h3>
                <p className="text-xs font-semibold text-slate-600 max-w-sm mx-auto">
                  Drag & drop files or folders here, or use the buttons below to encrypt and store data in your private vault.
                </p>
              </div>

              {!isSharedView && (
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={onNewFolder}
                    className="px-4 py-2.5 bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-900 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-slate-700 stroke-[2.5]" />
                    <span>New Folder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => emptyFileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-4 h-4 stroke-[2.5]" />
                    <span>Upload Files</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => emptyFolderInputRef.current?.click()}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <FolderUp className="w-4 h-4 text-slate-700 stroke-[2.5]" />
                    <span>Upload Folder</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* VIEW MODE 2: Traditional Table View */
        <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-900 font-bold border-b-2 border-slate-300">
                <tr>
                  <th className="px-6 py-3.5 font-bold text-slate-900 text-xs">Name</th>
                  <th className="px-4 py-3.5 font-bold text-slate-900 text-xs">Type</th>
                  <th className="px-4 py-3.5 font-bold text-slate-900 text-xs">Size</th>
                  <th className="px-4 py-3.5 font-bold text-slate-900 text-xs">Encryption</th>
                  <th className="px-4 py-3.5 font-bold text-slate-900 text-xs">Date</th>
                  <th className="px-6 py-3.5 text-right font-bold text-slate-900 text-xs">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {/* Ongoing Uploads in table */}
                {activeUploads && activeUploads.map((upload) => (
                  <tr key={upload.id} className="bg-blue-50/40 hover:bg-blue-50/60 transition-colors">
                    <td className="px-6 py-3 font-semibold text-slate-900 max-w-xs truncate">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-1.5 rounded-lg ${upload.isFailed ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-[#1e40af]'}`}>
                          {upload.type === 'folder' ? <FolderIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-slate-900 truncate">{upload.name}</div>
                          <div className="text-[10px] text-blue-600 font-mono flex items-center gap-1.5 mt-0.5">
                            <span>{upload.status || 'Encrypting & Uploading...'}</span>
                            <span>({Math.round(upload.progress || 0)}%)</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{upload.type || 'file'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                      {upload.size ? (upload.size > 1024 * 1024 ? `${(upload.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(upload.size / 1024)} KB`) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-24 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${upload.isFailed ? 'bg-red-500' : 'bg-blue-600'}`}
                          style={{ width: `${Math.max(5, upload.progress || 0)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[11px]">
                      {upload.isCompleted ? 'Finished' : upload.isFailed ? 'Error' : 'Uploading now...'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={`text-xs font-bold font-mono ${upload.isFailed ? 'text-red-600' : 'text-blue-700'}`}>
                        {Math.round(upload.progress || 0)}%
                      </span>
                    </td>
                  </tr>
                ))}

                {/* Folders in table */}
                {folders.map((folder) => (
                  <tr
                    key={folder.id}
                    onClick={() => onOpenFolder && onOpenFolder(folder)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 font-semibold text-slate-900 max-w-xs truncate">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
                          <FolderIcon className="w-4 h-4" />
                        </div>
                        <span className="truncate">{folder.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">Folder</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {folder.itemCount || 0} items
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-slate-500">
                        Folder
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {folder.createdAt ? new Date(folder.createdAt).toLocaleDateString() : 'Active'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        {folder.isOwner !== false && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSharingFolder(folder);
                            }}
                            className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                            title="Share folder"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {folder.isOwner !== false && onDeleteFolder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFolder(folder);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Delete folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Files in table */}
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-900 max-w-xs truncate">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-1.5 bg-slate-100 text-[#1e40af] rounded-lg">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="truncate" title={file.originalName}>
                          {file.originalName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenVersions(file)}
                          title="Click to view Version History & Revisions"
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[#1e40af] border border-blue-200 font-bold shrink-0 cursor-pointer transition-colors"
                        >
                          v{file.currentVersion || 1}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[120px]">
                      {file.mimeType || 'Document'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {(file.encryptedSize / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-4 py-3">
                      {isSharedView ? (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                            file.role === 'editor'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {file.role === 'editor' ? 'Editor' : 'View Only'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-slate-500">
                          Encrypted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : 'Active'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => setPreviewFile(file)}
                          className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                          title="Preview"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenVersions(file)}
                          className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                          title="Version History & Revisions"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenAudit(file)}
                          className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                          title="Audit Trail"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        {file.isOwner && (
                          <button
                            onClick={() => {
                              const newName = prompt('Enter new file name:', file.originalName);
                              if (newName && newName.trim()) {
                                handleRenameFile(file.id, newName.trim());
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                            title="Rename"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {file.role !== 'viewer' && (
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {file.isOwner && (
                          <button
                            onClick={() => setShareFile(file)}
                            className="p-1.5 text-slate-500 hover:text-[#1e40af] rounded hover:bg-slate-100"
                            title="Share"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {file.isOwner && (
                          <button
                            onClick={() => handleDelete(file)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {!hasItems && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-500">
                      No files or folders to display.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}



      {/* Unlock Session Private Key Modal */}
      <UnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        onSuccess={() => setShowUnlockModal(false)}
      />

      {/* Decrypted Preview Modal */}
      {previewFile && (
        <PreviewModal
          file={previewFile}
          isOpen={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
          onRefresh={onRefresh}
        />
      )}

      {/* Cryptographic Share Modal */}
      {shareFile && (
        <ShareModal
          file={shareFile}
          isOpen={Boolean(shareFile)}
          onClose={() => {
            setShareFile(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Folder Share Modal */}
      {sharingFolder && (
        <FolderShareModal
          folder={sharingFolder}
          isOpen={Boolean(sharingFolder)}
          onClose={() => setSharingFolder(null)}
        />
      )}

      {/* Audit Trail Modal */}
      {auditFile && (
        <AuditModal
          file={auditFile}
          isOpen={Boolean(auditFile)}
          onClose={() => setAuditFile(null)}
          onRefreshFile={onRefresh}
          initialTab={auditInitialTab}
        />
      )}

      {/* Generate Link Modal (Requirement 1) */}
      <GenerateLinkModal
        isOpen={Boolean(generateLinkItem)}
        initialItem={generateLinkItem}
        onClose={() => setGenerateLinkItem(null)}
        onLinkCreated={() => {
          if (onRefresh) onRefresh();
        }}
      />

      {/* Owner Access Management Modal (Requirement 8) */}
      {manageAccessItem && (
        <ManageAccessModal
          isOpen={Boolean(manageAccessItem)}
          targetType={manageAccessItem.type}
          targetId={manageAccessItem.id}
          targetName={manageAccessItem.name}
          onClose={() => setManageAccessItem(null)}
        />
      )}

      {/* Version History Modal (Requirement 7) */}
      {versionHistoryFile && (
        <VersionHistoryModal
          isOpen={Boolean(versionHistoryFile)}
          fileId={versionHistoryFile.id}
          fileName={versionHistoryFile.originalName}
          isOwner={versionHistoryFile.isOwner !== false}
          allowDownload={versionHistoryFile.allowDownload !== false}
          role={versionHistoryFile.role || 'viewer'}
          fileCryptoKey={versionCryptoKey}
          onClose={() => setVersionHistoryFile(null)}
          onVersionRestored={() => {
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}
