import React, { useState } from 'react';
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
} from 'lucide-react';
import PreviewModal from './PreviewModal';
import ShareModal from './ShareModal';
import AuditModal from './AuditModal';
import UnlockModal from './UnlockModal';
import FileCard from './FileCard';
import FolderCard from './FolderCard';
import NewMenuButton from './NewMenuButton';
import NewFolderModal from './NewFolderModal';
import FolderShareModal from './FolderShareModal';

export default function FileList({
  files = [],
  folders = [],
  breadcrumbs = [],
  currentFolderId = null,
  currentFolderName = null,
  isSharedView = false,
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
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);

  // Modals state
  const [previewFile, setPreviewFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [sharingFolder, setSharingFolder] = useState(null);
  const [auditFile, setAuditFile] = useState(null);
  const [auditInitialTab, setAuditInitialTab] = useState('audit');

  const handleOpenVersions = (file) => {
    setAuditInitialTab('versions');
    setAuditFile(file);
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
    // If viewer, downloading is disallowed
    if (file.role === 'viewer') {
      alert('Downloading is disabled for Viewers. You can view the document in protected preview mode.');
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
      const wrappedKeyBundle = meta.file.wrappedFileKey;
      const iv = meta.file.iv;

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
      setError(`Decryption failed: ${err.message}`);
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

  const hasItems = (folders && folders.length > 0) || (files && files.length > 0);

  return (
    <div className="space-y-4">
      {/* Top Controls & Breadcrumbs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
        {/* Left Side: Breadcrumb Navigation */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <nav className="flex items-center space-x-1.5 text-xs text-slate-600 pl-1">
            <button
              type="button"
              onClick={() => onNavigateBreadcrumb && onNavigateBreadcrumb(null)}
              className="flex items-center gap-1 font-semibold text-slate-800 hover:text-[#1e40af] hover:underline"
            >
              <Home className="w-3.5 h-3.5" />
              <span>{isSharedView ? 'Shared Files' : 'Vault Files'}</span>
            </button>

            {breadcrumbs && breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || idx}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => onNavigateBreadcrumb && onNavigateBreadcrumb(crumb.id)}
                  className={`truncate max-w-[140px] hover:underline ${
                    idx === breadcrumbs.length - 1
                      ? 'font-bold text-[#1e40af]'
                      : 'font-medium text-slate-600 hover:text-slate-900'
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
          <span className="text-[11px] text-slate-500 font-mono">
            {folders.length > 0 && `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}, `}
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>

          {/* Grid vs Table View Toggle */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                viewMode === 'grid'
                  ? 'bg-white text-[#1e40af] shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Grid View (4 Cards per Row)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                viewMode === 'table'
                  ? 'bg-white text-[#1e40af] shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Table List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Table</span>
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
          {/* Folders Section (if any) */}
          {folders && folders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FolderIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Folders ({folders.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onOpen={onOpenFolder}
                    onRename={onRenameFolder}
                    onDelete={onDeleteFolder}
                    onShare={(f) => setSharingFolder(f)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Files Section (4 cards per row) */}
          <div className="space-y-2">
            {folders && folders.length > 0 && files.length > 0 && (
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Files ({files.length})</span>
              </h3>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {files.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  isSharedView={isSharedView}
                  onPreview={setPreviewFile}
                  onDownload={handleDownload}
                  onShare={setShareFile}
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

          {/* Empty state if no folders and no files */}
          {!hasItems && (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 text-[#1e40af] flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 opacity-70" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {currentFolderName ? `"${currentFolderName}" is empty` : 'Your vault is empty'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload files or create folders using the + New button to encrypt and store data in your private vault.
                </p>
              </div>

              {!isSharedView && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(true)}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold shadow-xs"
                  >
                    + New Folder
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* VIEW MODE 2: Traditional Table View */
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Encryption</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
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

      {/* New Folder Modal */}
      <NewFolderModal
        isOpen={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        onCreate={handleCreateFolderSubmit}
      />

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

      {/* Audit Trail & Versions Modal */}
      {auditFile && (
        <AuditModal
          file={auditFile}
          isOpen={Boolean(auditFile)}
          onClose={() => setAuditFile(null)}
          onRefreshFile={onRefresh}
          initialTab={auditInitialTab}
        />
      )}
    </div>
  );
}
