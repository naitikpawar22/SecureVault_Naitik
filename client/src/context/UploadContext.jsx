import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';
import { uploadEncryptedFile } from '../services/uploadService';
import {
  saveQueuedUpload,
  getQueuedUploads,
  updateQueuedUpload,
  removeQueuedUpload,
} from '../utils/uploadDb';

const UploadContext = createContext(null);

export const UploadProvider = ({ children }) => {
  const { user } = useAuth();
  const [activeUploads, setActiveUploads] = useState([]);
  const activeControllersRef = useRef(new Map());
  const hasRecoveredRef = useRef(false);

  const isUploading = activeUploads.some((u) => !u.isCompleted && !u.isFailed);

  // Prevent accidental page refresh or closing while uploads are in flight
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isUploading) {
        e.preventDefault();
        e.returnValue = 'File uploads are currently in progress to Amazon S3. Leaving or reloading this page will interrupt your upload.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  // Update a single upload entry in React state
  const updateUploadItem = useCallback((id, updates) => {
    setActiveUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  // Dismiss a completed or failed upload item
  const dismissUpload = useCallback((id) => {
    activeControllersRef.current.delete(id);
    removeQueuedUpload(id);
    setActiveUploads((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setActiveUploads((prev) => {
      const remaining = prev.filter((item) => !item.isCompleted && !item.isFailed);
      const toRemove = prev.filter((item) => item.isCompleted || item.isFailed);
      toRemove.forEach((r) => removeQueuedUpload(r.id));
      return remaining;
    });
  }, []);

  // Cancel an active upload
  const cancelUpload = useCallback((id) => {
    const controller = activeControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      activeControllersRef.current.delete(id);
    }
    removeQueuedUpload(id);
    updateUploadItem(id, {
      progress: 100,
      isFailed: true,
      status: 'Upload cancelled',
      error: 'Cancelled by user',
    });
  }, [updateUploadItem]);

  /**
   * Execute single file encryption and upload with automatic session tracking and IndexedDB backup
   */
  const executeSingleUpload = useCallback(
    async (tracker, file, abortController, folderId, onCompleteCallback = null) => {
      updateUploadItem(tracker.id, {
        status: 'Encrypting with AES-256-GCM in browser...',
        progress: Math.max(15, tracker.progress || 15),
        isCompleted: false,
        isFailed: false,
      });

      try {
        await uploadEncryptedFile({
          file,
          user,
          folderId,
          existingSession: tracker.session || null,
          abortSignal: abortController.signal,
          onInitSession: (session) => {
            updateQueuedUpload(tracker.id, { session });
          },
          onPartUploaded: (partRes, allParts) => {
            updateQueuedUpload(tracker.id, {
              'session.uploadedParts': allParts,
            });
          },
          onProgress: (p) => {
            updateUploadItem(tracker.id, {
              progress: Math.max(10, Math.min(99, p)),
            });
          },
          onStatus: (s) => {
            updateUploadItem(tracker.id, { status: s });
          },
        });

        // Mark completed in UI
        updateUploadItem(tracker.id, {
          progress: 100,
          status: 'Encrypted & Stored in Amazon S3',
          isCompleted: true,
        });

        // Clean up from IndexedDB
        await removeQueuedUpload(tracker.id);

        // Trigger refresh event across the app
        window.dispatchEvent(new CustomEvent('vault:item-uploaded', { detail: { folderId } }));
        if (onCompleteCallback) onCompleteCallback();

        // Auto-remove completed box after 4 seconds
        setTimeout(() => {
          dismissUpload(tracker.id);
        }, 4000);
      } catch (err) {
        if (abortController.signal.aborted) {
          await removeQueuedUpload(tracker.id);
          return;
        }
        console.error(`Upload error for "${file.name}":`, err);
        updateUploadItem(tracker.id, {
          progress: 100,
          isFailed: true,
          status: 'Upload failed',
          error: err.message || 'Encryption or upload failed',
        });
        await updateQueuedUpload(tracker.id, { isFailed: true, error: err.message });
      } finally {
        activeControllersRef.current.delete(tracker.id);
      }
    },
    [user, updateUploadItem, dismissUpload]
  );

  /**
   * Auto-recover any uploads interrupted by a page reload/refresh
   */
  useEffect(() => {
    if (!user || hasRecoveredRef.current) return;
    hasRecoveredRef.current = true;

    const recoverUploads = async () => {
      try {
        const queued = await getQueuedUploads();
        if (!queued || queued.length === 0) return;

        const pending = queued.filter((q) => !q.isCompleted && !q.isFailed && q.file);
        if (pending.length === 0) return;

        console.log(`[UploadContext] Resuming ${pending.length} pending uploads after page refresh/reload...`);
        setActiveUploads((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = pending.filter((p) => !existingIds.has(p.id));
          return [...newItems, ...prev];
        });

        for (const item of pending) {
          const abortController = new AbortController();
          activeControllersRef.current.set(item.id, abortController);
          await executeSingleUpload(item, item.file, abortController, item.folderId);
        }
      } catch (err) {
        console.warn('[UploadContext] Could not recover queued uploads:', err);
      }
    };

    recoverUploads();
  }, [user, executeSingleUpload]);

  // Upload individual files
  const uploadFiles = useCallback(
    async (fileList, folderId = null, onCompleteCallback = null) => {
      if (!fileList || fileList.length === 0) return;

      const filesArray = Array.from(fileList);
      const newItems = filesArray.map((file, idx) => ({
        id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: 'file',
        progress: 5,
        status: 'Deriving AES-256 key...',
        isCompleted: false,
        isFailed: false,
        error: null,
        folderId,
      }));

      setActiveUploads((prev) => [...newItems, ...prev]);

      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const tracker = newItems[i];

        // Persist upload item with the native File object in IndexedDB
        await saveQueuedUpload({
          ...tracker,
          file,
        });

        const abortController = new AbortController();
        activeControllersRef.current.set(tracker.id, abortController);

        await executeSingleUpload(tracker, file, abortController, folderId, onCompleteCallback);
      }
    },
    [executeSingleUpload]
  );

  // Upload an entire folder
  const uploadFolder = useCallback(
    async (fileList, parentFolderId = null, onCompleteCallback = null) => {
      if (!fileList || fileList.length === 0) return;

      const filesArray = Array.from(fileList);
      const firstPath = filesArray[0].webkitRelativePath || filesArray[0].relativePath || '';
      const folderName =
        firstPath && firstPath.includes('/') ? firstPath.split('/')[0] : 'Uploaded Folder';
      const totalBytes = filesArray.reduce((acc, f) => acc + (f.size || 0), 0);

      const folderTrackerId = `folder-upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const folderTracker = {
        id: folderTrackerId,
        name: folderName,
        size: totalBytes,
        type: 'folder',
        progress: 5,
        status: `Creating folder "${folderName}" in S3 Vault...`,
        isCompleted: false,
        isFailed: false,
        error: null,
        folderId: parentFolderId,
      };

      setActiveUploads((prev) => [folderTracker, ...prev]);
      const abortController = new AbortController();
      activeControllersRef.current.set(folderTrackerId, abortController);

      try {
        const newFolderRes = await api.folders.create({
          name: folderName,
          parentId: parentFolderId,
        });
        const newFolderId = newFolderRes.folder.id;

        updateUploadItem(folderTrackerId, {
          status: `Encrypting ${filesArray.length} files with AES-256-GCM...`,
          progress: 10,
        });

        for (let i = 0; i < filesArray.length; i++) {
          if (abortController.signal.aborted) {
            throw new Error('Folder upload cancelled by user.');
          }

          const file = filesArray[i];
          const basePct = Math.round((i / filesArray.length) * 100);
          const nextPct = Math.round(((i + 1) / filesArray.length) * 100);

          updateUploadItem(folderTrackerId, {
            status: `Encrypting "${file.name}" (${i + 1}/${filesArray.length})...`,
            progress: Math.max(10, basePct),
          });

          await uploadEncryptedFile({
            file,
            user,
            folderId: newFolderId,
            abortSignal: abortController.signal,
            onProgress: (p) => {
              const overall = Math.round(basePct + (p / 100) * (nextPct - basePct));
              updateUploadItem(folderTrackerId, { progress: Math.min(99, overall) });
            },
            onStatus: (s) => {
              updateUploadItem(folderTrackerId, { status: s });
            },
          });
        }

        updateUploadItem(folderTrackerId, {
          progress: 100,
          status: `Folder "${folderName}" (${filesArray.length} files) uploaded to S3`,
          isCompleted: true,
        });

        window.dispatchEvent(new CustomEvent('vault:item-uploaded', { detail: { folderId: parentFolderId } }));
        if (onCompleteCallback) onCompleteCallback();

        setTimeout(() => {
          dismissUpload(folderTrackerId);
        }, 4000);
      } catch (err) {
        console.error(`Folder upload error for "${folderName}":`, err);
        updateUploadItem(folderTrackerId, {
          progress: 100,
          isFailed: true,
          status: 'Folder upload failed',
          error: err.message || 'Folder upload failed',
        });
      } finally {
        activeControllersRef.current.delete(folderTrackerId);
      }
    },
    [user, updateUploadItem, dismissUpload]
  );

  // Global window event listeners for uploads initiated anywhere in app
  useEffect(() => {
    const handleFilesEvent = (e) => {
      if (e.detail) {
        const files = e.detail.files || e.detail;
        const folderId = e.detail.folderId || null;
        uploadFiles(files, folderId);
      }
    };

    const handleFolderEvent = (e) => {
      if (e.detail) {
        const files = e.detail.files || e.detail;
        const folderId = e.detail.folderId || null;
        uploadFolder(files, folderId);
      }
    };

    window.addEventListener('vault:upload-files', handleFilesEvent);
    window.addEventListener('vault:upload-folder', handleFolderEvent);

    return () => {
      window.removeEventListener('vault:upload-files', handleFilesEvent);
      window.removeEventListener('vault:upload-folder', handleFolderEvent);
    };
  }, [uploadFiles, uploadFolder]);

  return (
    <UploadContext.Provider
      value={{
        activeUploads,
        isUploading,
        uploadFiles,
        uploadFolder,
        cancelUpload,
        dismissUpload,
        dismissAll,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
