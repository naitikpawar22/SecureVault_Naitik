import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { uploadEncryptedFile } from '../services/uploadService';
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
}) {
  const { user } = useAuth();
  const [ownedFiles, setOwnedFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [currentFolderName, setCurrentFolderName] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Ongoing upload status bar
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    // Reset folder view when switching between personal and shared tab
    setCurrentFolderId(null);
    setCurrentFolderName(null);
  }, [activeTab]);

  useEffect(() => {
    loadAll(currentFolderId);
  }, [currentFolderId, activeTab]);

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
    setCurrentFolderId(folder.id);
    setCurrentFolderName(folder.name);
  };

  const handleNavigateBreadcrumb = (folderId) => {
    setCurrentFolderId(folderId);
    if (!folderId) setCurrentFolderName(null);
  };

  /**
   * Create New Folder
   */
  const handleNewFolder = async (folderName) => {
    setError('');
    setSuccess('');
    try {
      await api.folders.create({
        name: folderName,
        parentId: currentFolderId,
      });
      setSuccess(`Folder "${folderName}" created successfully!`);
      loadAll(currentFolderId);
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
   * File Upload handler (triggered by + New button)
   */
  const handleFileUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(5);
    setError('');
    setSuccess('');

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setUploadStatus(`Encrypting and uploading "${file.name}" (${i + 1}/${fileList.length})...`);
        await uploadEncryptedFile({
          file,
          user,
          folderId: currentFolderId,
          onProgress: (p) => setUploadProgress(p),
          onStatus: (s) => setUploadStatus(s),
        });
      }
      setSuccess(`Successfully encrypted and uploaded ${fileList.length} ${fileList.length === 1 ? 'file' : 'files'} to vault.`);
      loadAll(currentFolderId);
    } catch (err) {
      console.error('File upload failed:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  /**
   * Folder Upload handler (with webkitdirectory)
   */
  const handleFolderUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(5);
    setError('');
    setSuccess('');

    try {
      // Find top folder name from webkitRelativePath
      const firstPath = fileList[0].webkitRelativePath || '';
      const folderName = firstPath.split('/')[0] || 'Uploaded Folder';

      setUploadStatus(`Creating folder "${folderName}" in S3 Vault...`);
      const newFolderRes = await api.folders.create({
        name: folderName,
        parentId: currentFolderId,
      });
      const newFolderId = newFolderRes.folder.id;

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setUploadStatus(`Encrypting "${file.name}" in folder "${folderName}" (${i + 1}/${fileList.length})...`);
        await uploadEncryptedFile({
          file,
          user,
          folderId: newFolderId,
          onProgress: (p) => setUploadProgress(p),
          onStatus: (s) => setUploadStatus(s),
        });
      }

      setSuccess(`Folder "${folderName}" with ${fileList.length} files encrypted & uploaded successfully!`);
      loadAll(currentFolderId);
    } catch (err) {
      console.error('Folder upload failed:', err);
      setError(err.message || 'Folder upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  // Filter based on search query
  const displayedOwned = ownedFiles.filter((f) =>
    f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const displayedShared = sharedFiles.filter((f) =>
    f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const displayedFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Upload Progress Notification */}
      {uploading && (
        <div className="p-4 bg-white border border-blue-200 rounded-xl shadow-md space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#1e40af] font-semibold">
              <UploadCloud className="w-4 h-4 animate-bounce" />
              <span>{uploadStatus || 'Encrypting & uploading...'}</span>
            </div>
            <span className="font-mono text-slate-700 font-bold">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#1e40af] h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

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
          onRefresh={() => loadAll(currentFolderId)}
          onOpenFolder={handleOpenFolder}
          onNavigateBreadcrumb={handleNavigateBreadcrumb}
          onNewFolder={handleNewFolder}
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
          onRefresh={() => loadAll(currentFolderId)}
          onOpenFolder={handleOpenFolder}
          onNavigateBreadcrumb={handleNavigateBreadcrumb}
          onNewFolder={handleNewFolder}
          onFileUpload={handleFileUpload}
          onFolderUpload={handleFolderUpload}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      )}
    </div>
  );
}
