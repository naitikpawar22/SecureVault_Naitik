import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { unwrapFileKey, decryptFile, encryptFile } from '../utils/crypto';
import {
  X,
  Eye,
  FileText,
  AlertCircle,
  Loader2,
  Download,
  ShieldAlert,
  Lock,
  Edit3,
  Save,
  Upload,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

export default function PreviewModal({ file, isOpen, onClose, onDownload, onRefresh }) {
  const { privateKey } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [previewType, setPreviewType] = useState('unknown');
  const [currentFek, setCurrentFek] = useState(null);

  // Versioning & In-browser Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [currentVersionNumber, setCurrentVersionNumber] = useState(file?.currentVersion || 1);
  const uploadVersionInputRef = useRef(null);

  // Anti-Screenshot & Screen Capture Defense
  const isViewer = file?.role === 'viewer';
  const isEditor = file?.isOwner || file?.role === 'editor';
  const [isScreenCaptureBlocked, setIsScreenCaptureBlocked] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      setCurrentVersionNumber(file.currentVersion || 1);
      setIsEditing(false);
      setSuccess('');
      setError('');
      loadAndDecryptPreview();
    }

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, file]);

  // Screen capture & screenshot interception when isViewer
  useEffect(() => {
    if (!isOpen || !isViewer) return;

    const handleKeyDown = (e) => {
      if (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === '4' || e.key === '3'))
      ) {
        e.preventDefault();
        setIsScreenCaptureBlocked(true);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('Screenshots and screen captures are prohibited for protected documents.');
        }
      }
    };

    const handleBlur = () => {
      setIsScreenCaptureBlocked(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsScreenCaptureBlocked(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, isViewer]);

  const loadAndDecryptPreview = async () => {
    setLoading(true);
    setError('');
    setPreviewUrl(null);
    setTextContent(null);
    setCurrentFek(null);
    setIsScreenCaptureBlocked(false);

    try {
      if (!privateKey) {
        throw new Error('Private encryption key is not active in this session.');
      }

      // 1. Get file metadata & wrapped key
      const meta = await api.files.get(file.id);
      const wrappedKeyBundle = meta.file.wrappedFileKey;
      const iv = meta.file.iv;
      setCurrentVersionNumber(meta.file.currentVersion || file.currentVersion || 1);

      // 2. Download encrypted binary stream
      const { blob } = await api.files.download(file.id);
      const encryptedBuffer = await blob.arrayBuffer();

      // 3. Unwrap FEK with user's private key
      const fek = await unwrapFileKey(wrappedKeyBundle, privateKey);
      setCurrentFek(fek);

      // 4. Decrypt file in browser memory with AES-256-GCM
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, iv);

      // 5. Determine preview format
      const mime = meta.file.mimeType || file.mimeType || '';
      const name = (meta.file.originalName || file.originalName || '').toLowerCase();

      if (mime.includes('pdf') || name.endsWith('.pdf')) {
        const decryptedBlob = new Blob([decryptedBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(decryptedBlob);
        setPreviewUrl(url);
        setPreviewType('pdf');
      } else if (
        mime.includes('image') ||
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.webp') ||
        name.endsWith('.svg')
      ) {
        const decryptedBlob = new Blob([decryptedBuffer], { type: mime || 'image/png' });
        const url = URL.createObjectURL(decryptedBlob);
        setPreviewUrl(url);
        setPreviewType('image');
      } else if (
        mime.includes('text') ||
        mime.includes('json') ||
        mime.includes('javascript') ||
        name.endsWith('.txt') ||
        name.endsWith('.json') ||
        name.endsWith('.md') ||
        name.endsWith('.csv') ||
        name.endsWith('.js') ||
        name.endsWith('.html') ||
        name.endsWith('.css') ||
        name.endsWith('.py') ||
        name.endsWith('.sql')
      ) {
        const dec = new TextDecoder();
        const text = dec.decode(decryptedBuffer);
        setTextContent(text);
        setEditedText(text);
        setPreviewType('text');
      } else {
        setPreviewType('unsupported');
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError(err.message || 'Failed to decrypt file for preview');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save Text Edit as a New Version
   */
  const handleSaveTextVersion = async () => {
    if (!currentFek) {
      setError('Encryption key not loaded. Cannot save new version.');
      return;
    }

    setSavingVersion(true);
    setError('');
    setSuccess('');

    try {
      const enc = new TextEncoder();
      const plaintextBuffer = enc.encode(editedText);

      // Encrypt new payload using existing FEK and a fresh random IV
      const { encryptedBuffer, iv } = await encryptFile(plaintextBuffer, currentFek);

      const formData = new FormData();
      formData.append(
        'encryptedFile',
        new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        `${file.originalName}.enc`
      );
      formData.append('iv', iv);
      formData.append('changeSummary', changeNote.trim() || `Version ${currentVersionNumber + 1} edit`);
      formData.append('mimeType', file.mimeType || 'text/plain');

      const res = await api.files.createVersion(file.id, formData);

      setTextContent(editedText);
      setIsEditing(false);
      setChangeNote('');
      setCurrentVersionNumber(res.version?.versionNumber || currentVersionNumber + 1);
      setSuccess(`New version v${res.version?.versionNumber || currentVersionNumber + 1} created and saved securely!`);

      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Save version error:', err);
      setError(err.message || 'Failed to save new file version');
    } finally {
      setSavingVersion(false);
    }
  };

  /**
   * Upload Replacement File as New Version
   */
  const handleUploadNewVersionFile = async (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    if (!currentFek) {
      setError('Encryption key not loaded. Please wait for decryption to finish.');
      return;
    }

    setSavingVersion(true);
    setError('');
    setSuccess('');

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();

      // Encrypt in-browser with current FEK and fresh IV
      const { encryptedBuffer, iv } = await encryptFile(arrayBuffer, currentFek);

      const formData = new FormData();
      formData.append(
        'encryptedFile',
        new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        `${uploadedFile.name}.enc`
      );
      formData.append('iv', iv);
      formData.append('changeSummary', `Uploaded new version from file "${uploadedFile.name}"`);
      formData.append('mimeType', uploadedFile.type || file.mimeType || 'application/octet-stream');

      const res = await api.files.createVersion(file.id, formData);

      setCurrentVersionNumber(res.version?.versionNumber || currentVersionNumber + 1);
      setSuccess(`Version v${res.version?.versionNumber || currentVersionNumber + 1} created from "${uploadedFile.name}"!`);

      // Reload preview for newly uploaded version
      await loadAndDecryptPreview();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Upload version error:', err);
      setError(err.message || 'Failed to create new file version');
    } finally {
      setSavingVersion(false);
      if (uploadVersionInputRef.current) {
        uploadVersionInputRef.current.value = '';
      }
    }
  };

  if (!isOpen || !file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none"
      onContextMenu={(e) => {
        if (isViewer) e.preventDefault();
      }}
    >
      {/* CSS Print & Capture Prevention */}
      {isViewer && (
        <style>{`
          @media print {
            body * { display: none !important; }
          }
        `}</style>
      )}

      <div className="bg-white rounded-xl border border-slate-300 max-w-4xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2 truncate">
            <Eye className="w-5 h-5 text-[#1e40af] shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              {file.originalName}
            </h3>
            <span className="text-[10px] font-mono bg-blue-100 text-[#1e40af] px-2 py-0.5 rounded font-bold border border-blue-200">
              v{currentVersionNumber}
            </span>

            {isViewer ? (
              <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-700" /> View Only
              </span>
            ) : isEditor ? (
              <span className="text-[10px] font-mono bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded border border-indigo-200 font-semibold flex items-center gap-1">
                <Edit3 className="w-3 h-3 text-indigo-700" /> Editor Access
              </span>
            ) : (
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                Decrypted
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Upload New Version Button for Editors/Owners */}
            {isEditor && (
              <>
                <input
                  type="file"
                  ref={uploadVersionInputRef}
                  onChange={handleUploadNewVersionFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => uploadVersionInputRef.current?.click()}
                  disabled={savingVersion || loading}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Upload a new revision file to create the next version"
                >
                  <Upload className="w-3.5 h-3.5 text-[#1e40af]" />
                  <span className="hidden sm:inline">Upload New Version</span>
                </button>
              </>
            )}

            {/* In-browser Edit Toggle for text files */}
            {isEditor && previewType === 'text' && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#1e40af] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Document</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success or Error alerts */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* Content View with Anti-Capture Blackout (Watermark Removed for Clean View-Only Display) */}
        <div
          onContextMenu={(e) => isViewer && e.preventDefault()}
          className={`flex-1 p-4 bg-slate-100 overflow-auto flex items-center justify-center relative ${
            isViewer ? 'select-none protected-view-content' : ''
          }`}
        >
          {/* Blackout Overlay on Screenshot / Screen Capture Attempt */}
          {isScreenCaptureBlocked && (
            <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center text-center p-6 space-y-4 animate-in fade-in duration-100">
              <ShieldAlert className="w-16 h-16 text-red-500 animate-pulse" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Protected Document — Screen Capture Prohibited
                </h3>
                <p className="text-xs text-slate-300 max-w-md">
                  Screenshots, snipping tools, and screen recordings are strictly prohibited for view-only documents.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScreenCaptureBlocked(false)}
                className="px-5 py-2 bg-[#1e40af] hover:bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                Resume Viewing
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 text-[#1e40af] animate-spin mx-auto" />
              <p className="text-xs text-slate-600 font-medium">
                Downloading encrypted payload and decrypting with AES-256-GCM...
              </p>
            </div>
          ) : isEditing ? (
            /* Inline Text Editor for Editors/Owners */
            <div className="w-full h-full flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-[#1e40af]" />
                  Editing Document (Creating v{currentVersionNumber + 1})
                </span>
                <span className="text-[11px] text-slate-500">
                  Plaintext modified in memory • Zero-knowledge encrypted on save
                </span>
              </div>

              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full flex-1 p-3 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-[#1e40af] resize-none"
                placeholder="Edit file contents..."
              />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <input
                  type="text"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="Summary of changes (e.g. Updated terms, fixed typo)"
                  className="w-full sm:w-80 text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditedText(textContent);
                    }}
                    disabled={savingVersion}
                    className="px-3.5 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTextVersion}
                    disabled={savingVersion}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1e40af] hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    {savingVersion ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Encrypting & Saving v{currentVersionNumber + 1}...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save as Version {currentVersionNumber + 1}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : previewType === 'pdf' ? (
            <iframe
              src={previewUrl}
              title="PDF Preview"
              className="w-full h-full rounded-lg border border-slate-300 bg-white"
            />
          ) : previewType === 'image' ? (
            <img
              src={previewUrl}
              alt="Decrypted Preview"
              draggable="false"
              className="max-h-full max-w-full object-contain rounded-lg border border-slate-300 bg-white p-2 shadow-xs"
            />
          ) : previewType === 'text' ? (
            <pre className="w-full h-full p-4 bg-white rounded-lg border border-slate-300 text-xs font-mono text-slate-900 overflow-auto whitespace-pre-wrap select-text">
              {textContent}
            </pre>
          ) : (
            <div className="text-center p-8 bg-white rounded-xl border border-slate-300 max-w-md">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900">Direct inline preview not available</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                This file format ({file.mimeType || 'binary'}) cannot be displayed inline.
              </p>
              {!isViewer && onDownload && (
                <button
                  onClick={() => {
                    onDownload(file);
                    onClose();
                  }}
                  className="px-4 py-2 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 mx-auto"
                >
                  <Download className="w-4 h-4" /> Decrypt & Download File
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span>AES-256-GCM zero-knowledge client decryption</span>
          <div className="flex gap-2">
            {!isViewer && onDownload && (
              <button
                onClick={() => {
                  onDownload(file);
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-[#1e40af] text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Download Plaintext
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-700 text-xs font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
