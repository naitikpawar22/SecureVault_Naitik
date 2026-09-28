import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { decryptFile } from '../utils/crypto';
import {
  History,
  RotateCcw,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Clock,
  User,
  Shield,
  FileText,
} from 'lucide-react';

export default function VersionHistoryModal({
  isOpen,
  onClose,
  fileId,
  fileName = '',
  isOwner = false,
  allowDownload = true,
  role = 'viewer',
  fileCryptoKey = null,
  onVersionRestored,
}) {
  const { user } = useAuth();
  const [versions, setVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [restoringVersionNumber, setRestoringVersionNumber] = useState(null);
  const [downloadingVersion, setDownloadingVersion] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Preview state
  const [previewContent, setPreviewContent] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (isOpen && fileId) {
      loadVersions();
    }
  }, [isOpen, fileId]);

  const loadVersions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.files.listVersions(fileId);
      setVersions(res.versions || []);
      setCurrentVersion(res.currentVersion || 1);
    } catch (err) {
      setError(err.message || 'Failed to load version history.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionNumber) => {
    if (!isOwner && role !== 'editor') {
      setError('You do not have permission to restore historical versions.');
      return;
    }

    if (!window.confirm(`Restore Version ${versionNumber}? This will create a new version with the contents of v${versionNumber}.`)) {
      return;
    }

    setRestoringVersionNumber(versionNumber);
    setError('');
    setSuccess('');
    try {
      const res = await api.files.restoreVersion(fileId, versionNumber);
      setSuccess(`Version ${versionNumber} successfully restored as new version v${res.currentVersion}!`);
      loadVersions();
      if (onVersionRestored) onVersionRestored(res.currentVersion);
    } catch (err) {
      setError(err.message || 'Failed to restore version.');
    } finally {
      setRestoringVersionNumber(null);
    }
  };

  const handleDownloadVersion = async (versionNumber) => {
    if (!isOwner && !allowDownload) {
      setError('Downloading is disabled for this document. You have view-only access.');
      return;
    }

    setDownloadingVersion(versionNumber);
    setError('');
    try {
      const res = await api.files.downloadVersion(fileId, versionNumber);
      let downloadBlob = res.blob;

      // If encryption key available, decrypt before saving
      if (fileCryptoKey && res.iv) {
        try {
          const encBuffer = await res.blob.arrayBuffer();
          const decBuffer = await decryptFile(encBuffer, fileCryptoKey, res.iv);
          downloadBlob = new Blob([decBuffer]);
        } catch (decErr) {
          console.warn('Could not decrypt client-side, saving raw ciphertext:', decErr);
        }
      }

      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.v${versionNumber}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download version.');
    } finally {
      setDownloadingVersion(null);
    }
  };

  const handlePreviewVersion = async (v) => {
    setLoadingPreview(true);
    setPreviewTitle(`Version ${v.versionNumber} Preview`);
    setError('');
    try {
      const res = await api.files.downloadVersion(fileId, v.versionNumber, 'preview');
      if (fileCryptoKey && res.iv) {
        const encBuffer = await res.blob.arrayBuffer();
        const decBuffer = await decryptFile(encBuffer, fileCryptoKey, res.iv);
        const text = new TextDecoder().decode(decBuffer);
        setPreviewContent(text.substring(0, 50000));
      } else {
        setPreviewContent('[Encrypted Ciphertext - Decryption key required for plaintext preview]');
      }
    } catch (err) {
      setError(err.message || 'Failed to preview historical version.');
      setPreviewContent(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Version History</h3>
              <p className="text-[11px] text-slate-500 truncate max-w-md">{fileName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-[#1e40af] animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading version history from storage...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No version history records found.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => {
                const isCurrent = v.versionNumber === currentVersion;
                return (
                  <div
                    key={v.id || v.versionNumber}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-blue-50/70 border-blue-200'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            Version {v.versionNumber}
                          </span>
                          {isCurrent ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1e40af] text-white">
                              Current
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                              Historical
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 font-mono">
                            {formatBytes(v.encryptedSize)}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-600 mt-1">
                          {v.changeSummary || `Version ${v.versionNumber} update`}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                          <span>Updated by {v.uploadedBy?.name || 'Owner'}</span>
                          <span>•</span>
                          <span>{new Date(v.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        {/* Preview button */}
                        {fileCryptoKey && (
                          <button
                            type="button"
                            onClick={() => handlePreviewVersion(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            title="Preview Version"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                        )}

                        {/* Download button */}
                        {(isOwner || allowDownload) && (
                          <button
                            type="button"
                            disabled={downloadingVersion === v.versionNumber}
                            onClick={() => handleDownloadVersion(v.versionNumber)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                            title="Download Version"
                          >
                            {downloadingVersion === v.versionNumber ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span>Download</span>
                          </button>
                        )}

                        {/* Restore button (Owner or Editor only) */}
                        {!isCurrent && (isOwner || role === 'editor') && (
                          <button
                            type="button"
                            disabled={restoringVersionNumber === v.versionNumber}
                            onClick={() => handleRestore(v.versionNumber)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50 shadow-2xs"
                            title="Restore this version as current"
                          >
                            {restoringVersionNumber === v.versionNumber ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Preview Drawer */}
          {previewContent && (
            <div className="mt-4 p-4 border border-blue-200 bg-blue-50/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-blue-950">{previewTitle}</span>
                <button
                  type="button"
                  onClick={() => setPreviewContent(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <pre className="text-xs p-3 bg-white border border-slate-200 rounded-lg font-mono text-slate-800 max-h-48 overflow-y-auto whitespace-pre-wrap">
                {previewContent}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
