import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUpload } from '../context/UploadContext';
import { api } from '../services/api';
import FileList from '../components/FileList';
import {
  Search,
  RefreshCw,
  AlertCircle,
  Loader2,
  UploadCloud,
  CheckCircle,
} from 'lucide-react';

export default function DashboardPage({
  activeTab = 'files',
  setActiveTab,
  onUpdateTotalBytes,
  searchQuery: externalSearchQuery,
  currentFolderId = null,
  setCurrentFolderId,
  currentFolderName = null,
  setCurrentFolderName,
  onOpenNewFolder,
  folderRefreshTrigger = 0,
}) {
  const { user } = useAuth();
  const { activeUploads, uploadFiles, uploadFolder, dismissUpload } = useUpload();
  const [ownedFiles, setOwnedFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const activeSearch = (externalSearchQuery !== undefined ? externalSearchQuery : searchQuery) || '';

  useEffect(() => {
    loadAll(currentFolderId);
  }, [currentFolderId, activeTab, folderRefreshTrigger]);


  const loadAll = async (folderId = currentFolderId) => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'shared') {
        const [filesRes, foldersRes] = await Promise.all([
          api.files.list({ folderId: folderId || 'root' }),
          api.folders.list({ parentId: folderId, shared: true }),
        ]);

        setSharedFiles(filesRes.sharedFiles || []);
        setFolders(foldersRes.folders || []);
        setBreadcrumbs(foldersRes.breadcrumbs || []);
      } else {
        const [filesRes, allFilesRes, foldersRes] = await Promise.all([
          api.files.list({ folderId: folderId || 'root' }),
          api.files.list({ all: true }), // For total storage bytes calculation
          api.folders.list(folderId),
        ]);

        setOwnedFiles(filesRes.files || []);
        setSharedFiles(filesRes.sharedFiles || []);
        setFolders(foldersRes.folders || []);
        setBreadcrumbs(foldersRes.breadcrumbs || []);

        // Calculate total storage across user's vault
        const totalVaultBytes = (allFilesRes.files || []).reduce(
          (acc, f) => acc + (f.encryptedSize || 0),
          0
        );
        if (onUpdateTotalBytes) onUpdateTotalBytes(totalVaultBytes);
      }
    } catch (err) {
      console.error('Failed to load vault items:', err);
      setError(err.message || 'Could not load vault contents from server');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Folder Navigation
   */
  const handleOpenFolder = (folder) => {
    if (!folder || !folder.id) return;
    if (setCurrentFolderId) setCurrentFolderId(folder.id);
    if (setCurrentFolderName) setCurrentFolderName(folder.name);
  };

  const handleNavigateBreadcrumb = (folderId) => {
    if (setCurrentFolderId) setCurrentFolderId(folderId);
    if (!folderId && setCurrentFolderName) setCurrentFolderName(null);
  };

  /**
   * Create New Folder
   */
  const handleNewFolder = async (folderName) => {
    setError('');
    setSuccess('');
    try {
      const res = await api.folders.create({
        name: folderName,
        parentId: currentFolderId,
      });
      setSuccess(`Folder "${folderName}" created successfully!`);
      if (res && res.folder && res.folder.id) {
        if (setCurrentFolderId) setCurrentFolderId(res.folder.id);
        if (setCurrentFolderName) setCurrentFolderName(res.folder.name);
      } else {
        loadAll(currentFolderId);
      }
    } catch (err) {
      setError(err.message || 'Failed to create folder.');
    }
  };

  /**
   * Rename Folder
   */
  const handleRenameFolder = async (folderId, newName) => {
    setError('');
    setSuccess('');
    try {
      await api.folders.rename(folderId, newName);
      setSuccess(`Folder renamed to "${newName}".`);
      loadAll(currentFolderId);
    } catch (err) {
      setError(err.message || 'Failed to rename folder.');
    }
  };

  /**
   * Delete Folder
   */
  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Move folder "${folder.name}" and all its contents to Bin?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.folders.delete(folder.id);
      setSuccess(`Folder "${folder.name}" moved to Bin.`);
      loadAll(currentFolderId);
    } catch (err) {
      setError(err.message || 'Failed to delete folder.');
    }
  };

  /**
   * File Upload handler (calls persistent global upload manager)
   */
  const handleFileUpload = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    uploadFiles(fileList, currentFolderId, () => loadAll(currentFolderId));
  };

  /**
   * Folder Upload handler (calls persistent global upload manager)
   */
  const handleFolderUpload = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    uploadFolder(fileList, currentFolderId, () => loadAll(currentFolderId));
  };

  // Auto-refresh vault contents when any background upload or folder action finishes
  useEffect(() => {
    const handleUploaded = (e) => {
      if (!e.detail?.folderId || e.detail.folderId === currentFolderId) {
        loadAll(currentFolderId);
      }
    };
    const handleRefresh = () => {
      loadAll(currentFolderId);
    };
    window.addEventListener('vault:item-uploaded', handleUploaded);
    window.addEventListener('vault:refresh-view', handleRefresh);
    return () => {
      window.removeEventListener('vault:item-uploaded', handleUploaded);
      window.removeEventListener('vault:refresh-view', handleRefresh);
    };
  }, [currentFolderId]);

  // Filter based on search query
  const displayedOwned = ownedFiles.filter((f) =>
    (f.originalName || '').toLowerCase().includes(activeSearch.toLowerCase())
  );
  const displayedShared = sharedFiles.filter((f) =>
    (f.originalName || '').toLowerCase().includes(activeSearch.toLowerCase())
  );
  const displayedFolders = folders.filter((f) =>
    (f.name || '').toLowerCase().includes(activeSearch.toLowerCase())
  );


  return (
    <div className="space-y-4">

      {/* Alert Notices */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Workspace (No 4 Metric boxes above, directly FileList with + New button in front) */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-[#1e40af] animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading secure vault files and folders...</p>
        </div>
      ) : activeTab === 'files' ? (
        <FileList
          files={displayedOwned}
          folders={displayedFolders}
          breadcrumbs={breadcrumbs}
          currentFolderId={currentFolderId}
          currentFolderName={currentFolderName}
          isSharedView={false}
          activeUploads={activeUploads.filter((u) => u.folderId === currentFolderId || (!u.folderId && !currentFolderId))}
          onDismissUpload={dismissUpload}
          onRefresh={() => loadAll(currentFolderId)}
          onOpenFolder={handleOpenFolder}
          onNavigateBreadcrumb={handleNavigateBreadcrumb}
          onNewFolder={onOpenNewFolder || handleNewFolder}
          onFileUpload={handleFileUpload}
          onFolderUpload={handleFolderUpload}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      ) : (
        <FileList
          files={displayedShared}
          folders={displayedFolders}
          breadcrumbs={breadcrumbs}
          currentFolderId={currentFolderId}
          currentFolderName={currentFolderName}
          isSharedView={true}
          activeUploads={activeUploads.filter((u) => u.folderId === currentFolderId || (!u.folderId && !currentFolderId))}
          onDismissUpload={dismissUpload}
          onRefresh={() => loadAll(currentFolderId)}
          onOpenFolder={handleOpenFolder}
          onNavigateBreadcrumb={handleNavigateBreadcrumb}
          onNewFolder={onOpenNewFolder || handleNewFolder}
          onFileUpload={handleFileUpload}
          onFolderUpload={handleFolderUpload}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      )}
    </div>
  );
}
