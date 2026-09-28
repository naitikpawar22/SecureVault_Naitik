import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  decryptFile,
  encryptFile,
  importFileKeyFromBase64,
  unwrapFileKey,
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
  ShieldCheck,
  LogOut,
  Folder as FolderIcon,
  Clock,
  History,
  Send,
  KeyRound,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import AuthModal from '../components/AuthModal';
import MfaModal from '../components/MfaModal';
import VersionHistoryModal from '../components/VersionHistoryModal';
import FileCard from '../components/FileCard';

export default function PublicSharedView({ token, keyParam, onGoHome }) {
  const { user, isAuthenticated, privateKey, unlockPrivateKey, logout, setSessionAuth } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [linkData, setLinkData] = useState(null);
  const [file, setFile] = useState(null);
  const [folder, setFolder] = useState(null);
  const [targetType, setTargetType] = useState('file');

  // Recipient access flow states
  const [accessState, setAccessState] = useState('checking'); // 'unauth' | 'mfa_setup' | 'mfa_verify' | 'can_request' | 'pending' | 'rejected' | 'revoked' | 'expired' | 'approved'
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingRequest, setPendingRequest] = useState(null);

  // Request Access form state
  const [requestedRole, setRequestedRole] = useState('viewer');
  const [requestMessage, setRequestMessage] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Decryption state
  const [decryptionKey, setDecryptionKey] = useState(keyParam || '');
  const [cryptoKey, setCryptoKey] = useState(null);
  const [keyUnlocking, setKeyUnlocking] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  // Modals state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaModalMode, setMfaModalMode] = useState('verify');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [activeVersionFile, setActiveVersionFile] = useState(null);

  // Preview Modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewText, setPreviewText] = useState(null);
  const [previewType, setPreviewType] = useState('unknown');
  const [downloading, setDownloading] = useState(false);

  // Anti-Screenshot & Screen Capture Defense
  const [isScreenCaptureBlocked, setIsScreenCaptureBlocked] = useState(false);

  // In-Browser Editor Modal state (for Editor role)
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [loadingEditorText, setLoadingEditorText] = useState(false);
  const [savingEditorText, setSavingEditorText] = useState(false);

  useEffect(() => {
    loadSharedAccess();
  }, [token, isAuthenticated, user?.mfaEnabled, user?.mfaVerified]);

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
    const isViewer = file?.role === 'viewer' || folder?.role === 'viewer';
    if (!isViewer) return;

    const handleKeyDown = (e) => {
      if (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        ((e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          (e.key === 's' || e.key === 'S' || e.key === '4' || e.key === '3'))
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
  }, [file?.role, folder?.role]);

  const loadSharedAccess = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.shared.getLinkFile(token);

      setTargetType(res.targetType || 'file');
      setLinkData(res.link || null);

      if (res.requiresAuth) {
        setAccessState('unauth');
        setFile(res.file || null);
        setFolder(res.folder || null);
        return;
      }

      if (res.requiresMfaSetup) {
        setAccessState('mfa_setup');
        return;
      }

      if (res.requiresMfaVerify) {
        setAccessState('mfa_verify');
        return;
      }

      if (res.requestStatus === 'none' || res.canRequest) {
        setAccessState('can_request');
        return;
      }

      if (res.requestStatus === 'pending') {
        setAccessState('pending');
        setPendingRequest(res.request || null);
        return;
      }

      if (res.requestStatus === 'approved') {
        setAccessState('approved');
        if (res.targetType === 'folder') {
          setFolder(res.folder);
        } else {
          setFile(res.file);
        }
        return;
      }
    } catch (err) {
      if (err.status === 403) {
        if (err.data?.requestStatus === 'rejected') {
          setAccessState('rejected');
          setRejectionReason(err.data?.rejectionReason || '');
          return;
        }
        if (err.data?.requestStatus === 'revoked') {
          setAccessState('revoked');
          return;
        }
        if (err.data?.requestStatus === 'expired') {
          setAccessState('expired');
          return;
        }
      }
      if (err.status === 410) {
        setAccessState('expired');
        setError('This share link has expired.');
        return;
      }
      setError(err.message || 'Unable to access shared item. Link may be invalid, disabled, or revoked.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Submit Access Request (Requirement 3)
   */
  const handleSendAccessRequest = async (e) => {
    e.preventDefault();
    setSubmittingRequest(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.accessRequests.create({
        token,
        requestedRole,
        message: requestMessage,
      });

      if (res.alreadyApproved) {
        setSuccess('Access already approved! Loading file...');
        loadSharedAccess();
      } else {
        setAccessState('pending');
        setPendingRequest(res.request);
        setSuccess('Your access request has been sent to the owner.');
      }
    } catch (err) {
      if (err.data?.code === 'MFA_SETUP_REQUIRED') {
        setAccessState('mfa_setup');
      } else if (err.data?.code === 'MFA_VERIFICATION_REQUIRED') {
        setAccessState('mfa_verify');
      } else if (err.data?.request) {
        setAccessState('pending');
        setPendingRequest(err.data.request);
      } else {
        setError(err.message || 'Failed to submit access request.');
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  /**
   * Resolve FEK via URL fragment or privateKey unwrap
   */
  const resolveCryptoKey = async (targetFile) => {
    const fileObj = targetFile || file;
    if (cryptoKey) return cryptoKey;

    if (decryptionKey) {
      const k = await importFileKeyFromBase64(decryptionKey);
      setCryptoKey(k);
      return k;
    }

    if (fileObj?.wrappedFileKey) {
      if (!privateKey) {
        setShowUnlockPrompt(true);
        throw new Error('Your cryptographic private key is locked. Please unlock it to decrypt this file.');
      }
      try {
        const unwrapped = await unwrapFileKey(fileObj.wrappedFileKey, privateKey);
        setCryptoKey(unwrapped);
        return unwrapped;
      } catch (err) {
        console.error('Failed to unwrap file key:', err);
        throw new Error('Could not decrypt file key with your private key.');
      }
    }

    throw new Error('No valid decryption key available for this document.');
  };

  /**
   * Unlock private key with password
   */
  const handleUnlockKey = async (e) => {
    e.preventDefault();
    setKeyUnlocking(true);
    setUnlockError('');
    try {
      await unlockPrivateKey(unlockPassword);
      setShowUnlockPrompt(false);
      setUnlockPassword('');
      setSuccess('Cryptographic private key unlocked successfully!');
    } catch (err) {
      setUnlockError(err.message || 'Failed to unlock private key.');
    } finally {
      setKeyUnlocking(false);
    }
  };

  /**
   * Download and Decrypt File (Blocked if allowDownload === false)
   */
  const handleDownload = async (targetFile) => {
    const fileObj = targetFile || file;
    if (fileObj?.allowDownload === false) {
      setError('Downloading is disabled for this document. You have view-only access.');
      return;
    }

    setDownloading(true);
    setError('');
    setSuccess('');

    try {
      const fek = await resolveCryptoKey(fileObj);
      const { blob } = await api.shared.downloadLinkFile(token);
      const encryptedBuffer = await blob.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, fileObj.iv);

      const decryptedBlob = new Blob([decryptedBuffer], {
        type: fileObj.mimeType || 'application/octet-stream',
      });
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileObj.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Decryption download error:', err);
      setError(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  /**
   * In-Browser Decrypted Preview
   */
  const handlePreview = async (targetFile) => {
    const fileObj = targetFile || file;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setError('');
    setIsScreenCaptureBlocked(false);

    try {
      const fek = await resolveCryptoKey(fileObj);
      const { blob } = await api.shared.downloadLinkFile(token, 'preview');
      const encryptedBuffer = await blob.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, fek, fileObj.iv);

      const mime = (fileObj.mimeType || '').toLowerCase();
      const name = (fileObj.originalName || '').toLowerCase();

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
      const fek = await resolveCryptoKey(file);
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
      const fek = await resolveCryptoKey(file);
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

      setSuccess('Encrypted changes saved to Vault successfully!');
      setEditorModalOpen(false);
    } catch (err) {
      console.error('Save failed:', err);
      setError(`Save failed: ${err.message}`);
    } finally {
      setSavingEditorText(false);
    }
  };

  const isEditor = file?.role === 'editor' || folder?.role === 'editor';
  const isViewer = file?.role === 'viewer' || folder?.role === 'viewer';
  const itemName = linkData?.name || file?.originalName || folder?.name || 'Shared Resource';
  const ownerName = linkData?.owner?.name || file?.owner?.name || folder?.owner?.name || 'Vault Owner';

  return (
    <div
      className="min-h-screen bg-[#f8fafc] flex flex-col text-slate-900 select-none"
      onContextMenu={(e) => {
        if (isViewer) e.preventDefault();
      }}
    >
      {/* CSS Print Defense for Viewers */}
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
                    <Lock className="w-3 h-3 text-emerald-400" /> Zero-Knowledge Link Portal
                  </span>
                </div>
                <p className="text-xs text-slate-400">Encrypted Access Control</p>
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
                    My Vault
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
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
            <Loader2 className="w-8 h-8 text-[#1e40af] animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">
              Verifying link access parameters with SecureVault backend...
            </p>
          </div>
        ) : error && accessState === 'checking' ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md mx-auto space-y-4 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Link Unavailable</h3>
            <p className="text-xs text-slate-500">{error}</p>
            <button
              onClick={onGoHome}
              className="w-full py-2.5 bg-[#1e40af] text-white text-xs font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Go to SecureVault Home
            </button>
          </div>
        ) : accessState === 'unauth' ? (
          /* STATE 1: Visitor Not Logged In (Requirement 2) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1e40af] flex items-center justify-center mx-auto mb-2">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Protected Share Link</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                You have received a link to access <span className="font-semibold text-slate-800">"{itemName}"</span> shared by <span className="font-semibold text-slate-800">{ownerName}</span>.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Authentication & MFA Required</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Possession of this link does not grant access. To protect zero-knowledge security, you must log in or register, complete authenticator-app TOTP MFA, and submit an access request to the owner.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  setAuthModalMode('login');
                  setShowAuthModal(true);
                }}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthModalMode('register');
                  setShowAuthModal(true);
                }}
                className="w-full py-2.5 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
              >
                Create Account
              </button>
            </div>
          </div>
        ) : accessState === 'mfa_setup' ? (
          /* STATE 2: Logged in, MFA Setup Required (Requirement 2) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900">MFA Setup Required</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Before submitting an access request for <span className="font-semibold text-slate-800">"{itemName}"</span>, you must configure Multi-Factor Authentication (authenticator-app TOTP) on your account.
              </p>
            </div>

            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 text-xs space-y-1">
              <span className="font-semibold">6-Digit Authenticator App Security</span>
              <p className="text-[11px] text-blue-800">
                SecureVault enforces RFC 6238 TOTP codes via Google Authenticator, Authy, or Microsoft Authenticator to prevent unauthorized access.
              </p>
            </div>

            <button
              onClick={() => {
                setMfaModalMode('setup');
                setShowMfaModal(true);
              }}
              className="w-full py-2.5 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Set Up Authenticator App</span>
            </button>
          </div>
        ) : accessState === 'mfa_verify' ? (
          /* STATE 3: MFA Enabled, Verification Required for Session (Requirement 2) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1e40af] flex items-center justify-center mx-auto mb-2">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900">MFA Verification Required</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Please enter the 6-digit TOTP code from your authenticator app to verify your identity for this access attempt.
              </p>
            </div>

            <button
              onClick={() => {
                setMfaModalMode('verify');
                setShowMfaModal(true);
              }}
              className="w-full py-2.5 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Enter 6-Digit MFA Code</span>
            </button>
          </div>
        ) : accessState === 'can_request' ? (
          /* STATE 4: MFA Verified, Ready to Create Access Request (Requirement 3) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1e40af] flex items-center justify-center mx-auto mb-2">
                <Send className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Request Access from Owner</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                You are requesting access to <span className="font-semibold text-slate-800">"{itemName}"</span> owned by <span className="font-semibold text-slate-800">{ownerName}</span>.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSendAccessRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Requested Access Type
                </label>
                <select
                  value={requestedRole}
                  onChange={(e) => setRequestedRole(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white text-slate-900 focus:outline-hidden focus:border-[#1e40af]"
                >
                  <option value="viewer">Viewer (View & Decrypt in Browser)</option>
                  <option value="editor">Editor (View, Edit & Upload Revisions)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Optional Note to Owner
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Introduce yourself or describe why you need access..."
                  rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white text-slate-900 focus:outline-hidden focus:border-[#1e40af] resize-none"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">Zero-Knowledge Guarantee:</span>
                <p className="mt-0.5">
                  Upon approval, the owner will wrap the file encryption key with your public key so only you can decrypt the contents.
                </p>
              </div>

              <button
                type="submit"
                disabled={submittingRequest}
                className="w-full py-2.5 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submittingRequest && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Submit Access Request</span>
              </button>
            </form>
          </div>
        ) : accessState === 'pending' ? (
          /* STATE 5: Access Request Pending (Requirement 3 & 10) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                Pending Approval
              </div>
              <h2 className="text-base font-bold text-slate-900 pt-2">Access Request Pending</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                “Your access request has been sent to the owner. You will be notified when the owner responds.”
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Resource</span>
                <span className="font-semibold text-slate-800">{itemName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Owner</span>
                <span className="font-semibold text-slate-800">{ownerName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Requested Permission</span>
                <span className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
                  {pendingRequest?.requestedRole || requestedRole}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Request Date</span>
                <span className="font-mono text-slate-700 text-[11px]">
                  {new Date(pendingRequest?.requestDate || pendingRequest?.createdAt || Date.now()).toLocaleDateString()}{' '}
                  {new Date(pendingRequest?.requestDate || pendingRequest?.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={loadSharedAccess}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Check Approval Status</span>
              </button>
              <button
                type="button"
                onClick={onGoHome}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Go to Vault Home
              </button>
            </div>
          </div>
        ) : accessState === 'rejected' ? (
          /* STATE 6: Request Rejected (Requirement 5 & 10) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2">
              <X className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">
                Rejected
              </div>
              <h2 className="text-base font-bold text-slate-900 pt-2">Access Request Rejected</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Your request to access <span className="font-semibold text-slate-800">"{itemName}"</span> was declined by the owner. Access remains blocked.
              </p>
            </div>

            {rejectionReason && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs text-left">
                <span className="font-semibold">Reason provided by owner:</span>
                <p className="mt-0.5">{rejectionReason}</p>
              </div>
            )}

            <button
              onClick={onGoHome}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-xs"
            >
              Return to Vault Home
            </button>
          </div>
        ) : accessState === 'revoked' ? (
          /* STATE 7: Access Revoked (Requirement 8 & 10) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">
                Revoked
              </div>
              <h2 className="text-base font-bold text-slate-900 pt-2">Access Revoked</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Your permission to access <span className="font-semibold text-slate-800">"{itemName}"</span> has been revoked by the owner. Previews, downloads, and key exchanges are blocked.
              </p>
            </div>

            <button
              onClick={onGoHome}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-xs"
            >
              Return to Vault Home
            </button>
          </div>
        ) : accessState === 'expired' ? (
          /* STATE 8: Link or Access Expired (Requirement 9 & 10) */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-200 text-slate-800 border border-slate-300">
                Expired
              </div>
              <h2 className="text-base font-bold text-slate-900 pt-2">Share Link Expired</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                This share link or your granted access time window has expired. Please contact the owner to request a new link.
              </p>
            </div>

            <button
              onClick={onGoHome}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-xs"
            >
              Return to Vault Home
            </button>
          </div>
        ) : accessState === 'approved' ? (
          /* STATE 9: Approved Authorized Access (Requirement 6) */
          <div className="space-y-6">
            {/* Status / Metric Banners */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Shared By</span>
                <div className="mt-2">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {ownerName}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    {linkData?.owner?.email || file?.owner?.email || folder?.owner?.email}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Granted Role</span>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      isEditor
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-blue-100 text-blue-900 border border-blue-300'
                    }`}
                  >
                    {isEditor ? 'Editor (Read & Write)' : 'Viewer (View Only)'}
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Download Permission</span>
                <div className="mt-2">
                  {(targetType === 'file' ? file?.allowDownload !== false : folder?.allowDownload !== false) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Download Allowed</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800">
                      <X className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Download Blocked</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <span className="text-xs font-medium text-slate-500">Decryption Method</span>
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Zero-Knowledge ECDH P-256</span>
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

            {/* Prompt to unlock private key if locked */}
            {showUnlockPrompt && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  <span>Unlock Your Private Key</span>
                </div>
                <p className="text-amber-800 text-[11px]">
                  Your browser session does not currently hold your decrypted ECDH private key in memory. Enter your account password to decrypt it client-side.
                </p>
                {unlockError && (
                  <p className="text-red-600 font-medium">{unlockError}</p>
                )}
                <form onSubmit={handleUnlockKey} className="flex gap-2 max-w-md">
                  <input
                    type="password"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="flex-1 p-2 bg-white border border-amber-300 rounded-lg text-xs text-slate-900 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={keyUnlocking || !unlockPassword}
                    className="px-4 py-2 bg-amber-800 text-white rounded-lg font-semibold hover:bg-amber-900 transition-colors disabled:opacity-50"
                  >
                    {keyUnlocking ? 'Unlocking...' : 'Unlock'}
                  </button>
                </form>
              </div>
            )}

            {/* Workspace Controls Header */}
            <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1e40af] flex items-center justify-center">
                  {targetType === 'folder' ? <FolderIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {targetType === 'folder' ? 'Approved Folder Workspace' : 'Approved Document Workspace'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isEditor
                      ? 'You have editor access. You can view, edit, or upload revisions.'
                      : (targetType === 'file' ? file?.allowDownload !== false : folder?.allowDownload !== false)
                      ? 'You have view & download access.'
                      : 'You have view-only access. Downloading and screen captures are prohibited.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {targetType === 'file' && (
                  <button
                    onClick={() => {
                      setActiveVersionFile(file);
                      setShowVersionHistory(true);
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5"
                    title="Version History"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Versions</span>
                  </button>
                )}

                {isEditor && targetType === 'file' && (
                  <button
                    onClick={handleOpenEditor}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Live Text Editor</span>
                  </button>
                )}
              </div>
            </div>

            {/* ITEM DISPLAY: FILE OR FOLDER (Requirement 6) */}
            {targetType === 'file' && file ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                <FileCard
                  file={{
                    ...file,
                    role: file.role || 'viewer',
                    allowDownload: file.allowDownload !== false,
                    isOwner: false,
                  }}
                  isSharedView={true}
                  onPreview={() => handlePreview(file)}
                  onDownload={() => handleDownload(file)}
                  onShare={() => {}}
                  onAudit={() => {}}
                  onDelete={() => {}}
                  downloading={downloading}
                  deleting={false}
                />
              </div>
            ) : targetType === 'folder' && folder ? (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-3">
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <span>{folder.name}</span>
                  </div>

                  {(!folder.files || folder.files.length === 0) && (!folder.subfolders || folder.subfolders.length === 0) ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      This folder contains no files or subfolders yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {folder.files?.map((f) => (
                        <FileCard
                          key={f.id}
                          file={{
                            ...f,
                            role: f.role || folder.role || 'viewer',
                            allowDownload: f.allowDownload !== false,
                            isOwner: false,
                          }}
                          isSharedView={true}
                          onPreview={() => handlePreview(f)}
                          onDownload={() => handleDownload(f)}
                          onShare={() => {}}
                          onAudit={() => {}}
                          onDelete={() => {}}
                          downloading={downloading}
                          deleting={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>SecureVault Enterprise Cryptographic Sharing</span>
          <span className="font-mono text-[11px]">
            Zero-Knowledge AES-256-GCM • ECDH P-256 • RFC 6238 TOTP
          </span>
        </div>
      </footer>

      {/* Auth Modal (Login / Register) */}
      <AuthModal
        isOpen={showAuthModal}
        initialMode={authModalMode}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          loadSharedAccess();
        }}
      />

      {/* MFA Modal (Setup / Verification) */}
      <MfaModal
        isOpen={showMfaModal}
        mode={mfaModalMode}
        onClose={() => setShowMfaModal(false)}
        onSuccess={(token, updatedUser) => {
          setShowMfaModal(false);
          if (token && updatedUser) {
            setSessionAuth(token, updatedUser);
          }
          loadSharedAccess();
        }}
      />

      {/* Version History Modal */}
      {showVersionHistory && activeVersionFile && (
        <VersionHistoryModal
          isOpen={showVersionHistory}
          fileId={activeVersionFile.id || activeVersionFile._id}
          fileName={activeVersionFile.originalName}
          isOwner={activeVersionFile.isOwner || false}
          allowDownload={activeVersionFile.allowDownload !== false}
          role={activeVersionFile.role || 'viewer'}
          fileCryptoKey={cryptoKey}
          onClose={() => setShowVersionHistory(false)}
          onVersionRestored={() => {
            loadSharedAccess();
          }}
        />
      )}

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
                  {file?.allowDownload !== false && (
                    <button
                      onClick={() => handleDownload(file)}
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
