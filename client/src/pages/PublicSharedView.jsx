import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  decryptFile,
  encryptFile,
  importFileKeyFromBase64,
} from '../utils/crypto';
import {
  Shield,
  Lock,
  Download,
  Eye,
  FileText,
  AlertCircle,
  Loader2,
  Check,
  CheckCircle,
  FileCode,
  Save,
  X,
  ShieldAlert,
  LogOut,
  Folder as FolderIcon,
} from 'lucide-react';
import AuthModal from '../components/AuthModal';
import FileCard from '../components/FileCard';
import NewMenuButton from '../components/NewMenuButton';

export default function PublicSharedView({ token, keyParam, onGoHome }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [decryptionKey, setDecryptionKey] = useState(keyParam || '');

  // Auth Modal state (triggered when secondary user taps + New)
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');

  // Preview Modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewText, setPreviewText] = useState(null);
  const [previewType, setPreviewType] = useState('unknown');

  // Anti-Screenshot & Screen Capture Defense
  const [isScreenCaptureBlocked, setIsScreenCaptureBlocked] = useState(false);

  // In-Browser Editor Modal state (for Editor role)
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [loadingEditorText, setLoadingEditorText] = useState(false);
  const [savingEditorText, setSavingEditorText] = useState(false);

  useEffect(() => {
    loadSharedFile();
  }, [token]);

  useEffect(() => {
    if (keyParam) {
      let cleanKey = keyParam;
      if (cleanKey.includes(' ') && !cleanKey.includes('+')) {
        cleanKey = cleanKey.replace(/ /g, '+');
      }
      setDecryptionKey(cleanKey);
    }
  }, [keyParam]);

  // Screen capture & screenshot prevention for view-only users
  useEffect(() => {
    const isViewer = file?.role === 'viewer';
    if (!isViewer) return;

    const handleKeyDown = (e) => {
      if (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === '4' || e.key === '3'))
      ) {
        e.preventDefault();
        setIsScreenCaptureBlocked(true);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('Screenshots and screen capture are prohibited for protected documents.');
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
  }, [file?.role]);

  const loadSharedFile = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.shared.getLinkFile(token);
      setFile(res.file);
    } catch (err) {
      setError(err.message || 'Unable to access shared file. Link may be expired or revoked.');
    } finally {
      setLoading(false);
    }
  };

  const getCryptoKey = async () => {
    if (!decryptionKey) {
      throw new Error('A valid AES-256 decryption key is required.');
    }
    return await importFileKeyFromBase64(decryptionKey);
  };

  /**
   * Decrypt and Download (Blocked if role === 'viewer')
   */
  const handleDownload = async () => {
    if (file?.role === 'viewer') {
      setError('Downloading is disabled for this document. You have view-only access.');
      return;
    }

    setDownloading(true);
    setError('');
    setSuccess('');

    try {
      const fek = await getCryptoKey();
      const { blob } = await api.shared.downloadLinkFile(token);
      const encryptedBuffer = await blob.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, file.iv);

      const decryptedBlob = new Blob([decryptedBuffer], {
        type: file.mimeType || 'application/octet-stream',
      });
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Decryption download error:', err);
      setError(`Decryption failed: ${err.message}.`);
    } finally {
      setDownloading(false);
    }
  };

  /**
   * In-Browser Decrypted Preview
   */
  const handlePreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setError('');
    setIsScreenCaptureBlocked(false);

    try {
      const fek = await getCryptoKey();
      // Pass purpose=preview so server allows in-memory decryption for viewers
      const { blob } = await api.shared.downloadLinkFile(token, 'preview');
      const encryptedBuffer = await blob.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, file.iv);

      const mime = (file.mimeType || '').toLowerCase();
      const name = (file.originalName || '').toLowerCase();

      if (mime.includes('pdf') || name.endsWith('.pdf')) {
        const decryptedBlob = new Blob([decryptedBuffer], { type: 'application/pdf' });
        setPreviewUrl(URL.createObjectURL(decryptedBlob));
        setPreviewType('pdf');
      } else if (
        mime.includes('image') ||
        /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(name)
      ) {
        const decryptedBlob = new Blob([decryptedBuffer], { type: mime || 'image/png' });
        setPreviewUrl(URL.createObjectURL(decryptedBlob));
        setPreviewType('image');
      } else if (
        mime.includes('text') ||
        mime.includes('json') ||
        /\.(txt|json|md|csv|js|jsx|ts|tsx|html|css|py|sql|xml|log|env)$/i.test(name)
      ) {
        const dec = new TextDecoder();
        setPreviewText(dec.decode(decryptedBuffer));
        setPreviewType('text');
      } else {
        setPreviewType('unsupported');
      }
    } catch (err) {
      console.error('Preview failed:', err);
      setError(`Preview error: ${err.message}`);
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  /**
   * Open In-Browser Editor (Editor Role Only)
   */
  const handleOpenEditor = async () => {
    setEditorModalOpen(true);
    setLoadingEditorText(true);
    setError('');

    try {
      const fek = await getCryptoKey();
      const { blob } = await api.shared.downloadLinkFile(token, 'preview');
      const encryptedBuffer = await blob.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, file.iv);
      const dec = new TextDecoder();
      setTextContent(dec.decode(decryptedBuffer));
    } catch (err) {
      setError(`Failed to decrypt for editing: ${err.message}`);
      setEditorModalOpen(false);
    } finally {
      setLoadingEditorText(false);
    }
  };

  /**
   * Save Edited Text to Vault (Editor Role Only)
   */
  const handleSaveEditorChanges = async () => {
    setSavingEditorText(true);
    setError('');
    setSuccess('');

    try {
      const fek = await getCryptoKey();
      const enc = new TextEncoder();
      const plaintextBuffer = enc.encode(textContent).buffer;

      // Re-encrypt modified text with same file key
      const { encryptedBuffer, iv } = await encryptFile(plaintextBuffer, fek);

      const blob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('encryptedFile', blob, `${file.originalName}.enc`);
      formData.append('iv', iv);
      formData.append('encryptedSize', encryptedBuffer.byteLength.toString());

      await api.shared.updateLinkFile(token, formData);

      setFile((prev) => ({
        ...prev,
        iv,
        encryptedSize: encryptedBuffer.byteLength,
      }));

      setSuccess('Encrypted changes saved to S3 Vault successfully!');
      setEditorModalOpen(false);
    } catch (err) {
      console.error('Save failed:', err);
      setError(`Save failed: ${err.message}`);
    } finally {
      setSavingEditorText(false);
    }
  };

  const isEditor = file?.role === 'editor';
  const isViewer = file?.role === 'viewer';

  return (
    <div
      className="min-h-screen bg-[#f8fafc] flex flex-col text-slate-900 select-none"
      onContextMenu={(e) => {
        if (isViewer) e.preventDefault();
      }}
    >
      {/* CSS Print & Screen Capture Defense */}
      {isViewer && (
        <style>{`
          @media print {
            body * { display: none !important; }
          }
        `}</style>
      )}

      {/* Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <div className="flex items-center space-x-3">
              <div className="bg-[#1e40af] p-2 rounded-xl text-white flex items-center justify-center shadow-xs">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-lg tracking-tight">SecureVault</span>
                  <span className="bg-slate-800 text-blue-300 text-xs font-semibold px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" /> Zero-Knowledge Portal
                  </span>
                </div>
                <p className="text-xs text-slate-400">Public Shared Cryptographic Access</p>
              </div>
            </div>

            {/* User Session / Auth Action */}
            <div className="flex items-center space-x-3">
              {isAuthenticated ? (
                <>
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-sm font-medium text-slate-200">{user?.name}</span>
                    <span className="text-xs text-slate-400 font-mono">{user?.email}</span>
                  </div>
                  <button
                    onClick={onGoHome}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg border border-slate-700 transition-colors"
                  >
                    Go to My Vault
                  </button>
                  <button
                    onClick={logout}
                    title="Logout"
                    className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setAuthModalMode('login');
                      setShowAuthModal(true);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg border border-slate-700 transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode('register');
                      setShowAuthModal(true);
                    }}
                    className="px-3.5 py-1.5 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shadow-xs"
                  >
                    Create Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
            <Loader2 className="w-8 h-8 text-[#1e40af] animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">
              Verifying cryptographic ACL token with server...
            </p>
          </div>
        ) : error && !file ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md mx-auto space-y-4 shadow-sm">
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={onGoHome}
              className="w-full py-2.5 bg-[#1e40af] text-white text-xs font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Go to SecureVault Home
            </button>
          </div>
        ) : file ? (
          <div className="space-y-6">
            {/* Status / Metric Banners */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Shared By</span>
                <div className="mt-2">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {file.owner?.name || 'Authorized Owner'}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">{file.owner?.email}</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Your Granted Role</span>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      isEditor
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-blue-100 text-blue-900 border border-blue-300'
                    }`}
                  >
                    {isEditor ? 'Editor (Read & Write)' : 'Viewer (View Only • Capture Disabled)'}
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Decryption Key</span>
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>URL Fragment Active (#key)</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Storage Engine</span>
                <div className="mt-2 text-xs font-semibold text-slate-900">
                  <span>Amazon S3 Bucket</span>
                  <div className="text-[10px] text-slate-400 font-mono">eu-north-1</div>
                </div>
              </div>
            </div>

            {/* Notifications */}
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

            {/* Workspace Controls Header with + New Button */}
            <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
              <div className="flex items-center space-x-3">
                <NewMenuButton
                  onNewFolder={() => {
                    if (!isAuthenticated) {
                      setAuthModalMode('register');
                      setShowAuthModal(true);
                    }
                  }}
                  onFileUpload={() => {
                    if (!isAuthenticated) {
                      setAuthModalMode('login');
                      setShowAuthModal(true);
                    }
                  }}
                  onFolderUpload={() => {
                    if (!isAuthenticated) {
                      setAuthModalMode('login');
                      setShowAuthModal(true);
                    }
                  }}
                />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Shared Vault Workspace
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isEditor
                      ? 'You have editor access. You can view, edit, or upload revisions.'
                      : 'You have view-only access. Downloading and screen captures are prohibited.'}
                  </p>
                </div>
              </div>

              {isEditor && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleOpenEditor}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Live Text Editor</span>
                  </button>
                </div>
              )}
            </div>

            {/* RESPONSIVE GRID (No Col 1 Upload box, shared file displayed cleanly) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              <FileCard
                file={{
                  ...file,
                  role: file.role || 'viewer',
                  isOwner: false,
                }}
                isSharedView={true}
                onPreview={handlePreview}
                onDownload={handleDownload}
                onShare={() => {}}
                onAudit={() => {}}
                onDelete={() => {}}
                downloading={downloading}
                deleting={false}
              />
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>SecureVault Enterprise Cryptographic Sharing</span>
          <span className="font-mono text-[11px]">
            Zero-Knowledge AES-256-GCM • ECDH P-256
          </span>
        </div>
      </footer>

      {/* Auth Modal for Secondary User Tap on + New */}
      <AuthModal
        isOpen={showAuthModal}
        initialMode={authModalMode}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setSuccess('Account authenticated! You can now access full vault features.');
        }}
      />

      {/* Decrypted Preview Modal with Screenshot Defense */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none"
          onContextMenu={(e) => {
            if (isViewer) e.preventDefault();
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-300 max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative">
            {/* Blackout Overlay on Screenshot / Screen Capture Attempt */}
            {isScreenCaptureBlocked && isViewer && (
              <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center text-center p-6 space-y-4">
                <ShieldAlert className="w-16 h-16 text-red-500 animate-pulse" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white tracking-wide">
                    Protected Document — Screen Capture Prohibited
                  </h3>
                  <p className="text-xs text-slate-300 max-w-md">
                    Screenshots, snipping tools, and screen recordings are strictly prohibited for view-only documents. Document has been obscured to prevent capture.
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


            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-[#1e40af]" />
                <h3 className="text-sm font-semibold text-slate-900 truncate max-w-md">
                  Preview: {file?.originalName}
                </h3>
                {isViewer && (
                  <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-semibold">
                    View Only • Capture Disabled
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setPreviewOpen(false);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setPreviewText(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex items-center justify-center relative">
              {previewLoading ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-7 h-7 text-[#1e40af] animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Decrypting stream in browser memory...</p>
                </div>
              ) : previewType === 'image' && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={file?.originalName}
                  draggable="false"
                  className="max-h-[60vh] max-w-full rounded-xl border border-slate-200 object-contain shadow-xs"
                />
              ) : previewType === 'pdf' && previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="PDF Preview"
                  className="w-full h-[60vh] border border-slate-200 rounded-xl"
                />
              ) : previewType === 'text' && previewText !== null ? (
                <pre className="w-full text-xs font-mono bg-slate-50 p-4 rounded-xl border border-slate-200 overflow-x-auto whitespace-pre-wrap max-h-[60vh] text-slate-900">
                  {previewText}
                </pre>
              ) : (
                <div className="text-center py-8 space-y-2">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500">
                    Direct inline preview is not supported for this file format.
                  </p>
                  {!isViewer && (
                    <button
                      onClick={handleDownload}
                      className="px-4 py-2 bg-[#1e40af] text-white text-xs font-medium rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      Download Plaintext File
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => {
                  setPreviewOpen(false);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setPreviewText(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Browser Live Text Editor Modal (Editor Role Only) */}
      {editorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl border border-slate-300 max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center space-x-2">
                <FileCode className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Live Document Editor: {file?.originalName}
                </h3>
              </div>
              <button
                onClick={() => setEditorModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col">
              {loadingEditorText ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-6 h-6 text-amber-700 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Decrypting text for live editing...</p>
                </div>
              ) : (
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full flex-1 p-3 text-xs font-mono border border-slate-300 rounded-xl bg-slate-900 text-emerald-400 focus:outline-hidden resize-none min-h-[350px]"
                />
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
              <button
                onClick={() => setEditorModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditorChanges}
                disabled={savingEditorText}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {savingEditorText && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-3.5 h-3.5" />
                <span>Save to Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
