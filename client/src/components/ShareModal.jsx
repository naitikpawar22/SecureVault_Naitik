import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  unwrapFileKey,
  wrapFileKeyForRecipient,
  generateFileKey,
  exportPublicKey,
  encryptFile,
  decryptFile,
  exportFileKeyToBase64,
} from '../utils/crypto';
import {
  X,
  Share2,
  Trash2,
  UserPlus,
  Check,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  Copy,
  RefreshCw,
  Clock,
  ShieldAlert,
  ExternalLink,
  ShieldCheck,
  Edit3,
  Eye,
  Lock,
  KeyRound,
  User,
  Shield,
  CheckCircle2,
  ChevronDown,
  History,
} from 'lucide-react';

export default function ShareModal({ file, isOpen, onClose }) {
  const { privateKey, unlockPrivateKey, user } = useAuth();
  const [activeTab, setActiveTab] = useState('user'); // 'user' | 'link' | 'rotate'

  // Email input and staged users state
  const [emailInput, setEmailInput] = useState('');
  const [defaultStagedRole, setDefaultStagedRole] = useState('viewer'); // 'viewer' | 'editor'
  const [stagedUsers, setStagedUsers] = useState([]); // Array of { user: { id, name, email, avatar, publicKey }, role: 'viewer' | 'editor' }
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Active permissions and audit history from backend
  const [permissions, setPermissions] = useState([]);
  const [shareLinks, setShareLinks] = useState([]);
  const [fileAuditLogs, setFileAuditLogs] = useState([]);
  const [expandedUserLogs, setExpandedUserLogs] = useState({});
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

  // Link generator options
  const [linkRole, setLinkRole] = useState('viewer'); // 'viewer' | 'editor'
  const [expiresHours, setExpiresHours] = useState('24');
  const [maxAccessCount, setMaxAccessCount] = useState('');
  const [newlyCreatedLink, setNewlyCreatedLink] = useState(null);
  const [cachedFekBase64, setCachedFekBase64] = useState(null);

  // Inline Key Unlock State
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockingKey, setUnlockingKey] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  useEffect(() => {
    if (isOpen && file) {
      loadData();
      setStagedUsers([]);
      setEmailInput('');
      setLookupError('');
      setError('');
      setSuccess('');
    }
  }, [isOpen, file]);

  // Derive file key whenever privateKey or file becomes available
  useEffect(() => {
    if (file?.wrappedFileKey && privateKey && !cachedFekBase64) {
      unwrapFileKey(file.wrappedFileKey, privateKey)
        .then(exportFileKeyToBase64)
        .then((b64) => setCachedFekBase64(b64))
        .catch((err) => console.warn('Could not derive base64 key:', err));
    }
  }, [file, privateKey, cachedFekBase64]);

  const handleUnlockKey = async (e) => {
    e.preventDefault();
    if (!unlockPassword) return;
    setUnlockingKey(true);
    setUnlockError('');
    setError('');
    try {
      await unlockPrivateKey(unlockPassword);
      setUnlockPassword('');
      setSuccess('Private encryption key unlocked successfully!');
    } catch (err) {
      setUnlockError(err.message || 'Incorrect password.');
    } finally {
      setUnlockingKey(false);
    }
  };

  const toggleUserLogs = (userId) => {
    setExpandedUserLogs((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const getShareLinksFn = api.files?.getShareLinks || api.files?.listShareLinks;
      const [permsRes, linksRes, auditRes] = await Promise.all([
        api.permissions.list(file.id).catch(() => ({ permissions: [] })),
        getShareLinksFn ? getShareLinksFn(file.id).catch(() => ({ links: [] })) : Promise.resolve({ links: [] }),
        api.audit.getFileLogs(file.id).catch(() => ({ logs: [] })),
      ]);
      setPermissions(permsRes.permissions || []);
      setShareLinks(linksRes.links || []);
      setFileAuditLogs(auditRes.logs || []);

      if (file?.wrappedFileKey && privateKey && !cachedFekBase64) {
        unwrapFileKey(file.wrappedFileKey, privateKey)
          .then(exportFileKeyToBase64)
          .then((b64) => setCachedFekBase64(b64))
          .catch((err) => console.warn('Could not derive base64 key for share links:', err));
      }
    } catch (err) {
      setError(err.message || 'Failed to load permissions and links');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Helper to render User Avatar
   */
  const renderUserAvatar = (u, sizeClass = 'w-9 h-9 text-xs') => {
    if (u.avatar && u.avatar.trim()) {
      return (
        <img
          src={u.avatar}
          alt={u.name || u.email}
          className={`${sizeClass} rounded-full object-cover border border-slate-200 shrink-0`}
        />
      );
    }
    const initials = (u.name || u.email || 'U')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return (
      <div
        className={`${sizeClass} rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center border border-blue-200 shrink-0 tracking-wider`}
      >
        {initials}
      </div>
    );
  };

  /**
   * 1. Add Registered User by Email Input
   */
  const handleAddUserByEmail = async (e) => {
    if (e) e.preventDefault();
    setLookupError('');
    setError('');

    const targetEmail = emailInput.trim().toLowerCase();
    if (!targetEmail) {
      setLookupError('Please enter a registered user email address.');
      return;
    }

    // Basic email format check
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(targetEmail)) {
      setLookupError('Please enter a valid email format (e.g. naitikpawar22@gmail.com).');
      return;
    }

    // Disallow self-share
    if (user?.email && targetEmail === user.email.toLowerCase()) {
      setLookupError('You are the owner of this file and already have full access.');
      return;
    }

    // Check if already in staged list
    if (stagedUsers.some((item) => item.user.email.toLowerCase() === targetEmail)) {
      setLookupError('This user has already been added to the sharing list.');
      return;
    }

    // Check if user already has active permission
    const existingPerm = permissions.find(
      (p) => p.email && p.email.toLowerCase() === targetEmail
    );
    if (existingPerm) {
      setLookupError(`User already has active "${existingPerm.role === 'editor' ? 'Edit' : 'View Only'}" access. You can update their permission below.`);
      return;
    }

    setLookingUp(true);
    try {
      const res = await api.users.lookup(targetEmail);
      if (!res.user) {
        throw new Error('User not found.');
      }

      setStagedUsers((prev) => [
        ...prev,
        {
          user: res.user,
          role: defaultStagedRole,
        },
      ]);
      setEmailInput('');
      setLookupError('');
    } catch (err) {
      console.warn('Lookup error:', err);
      setLookupError(
        err.message ||
          `No registered user found with the email "${targetEmail}". Only registered SecureVault users can receive access.`
      );
    } finally {
      setLookingUp(false);
    }
  };

  /**
   * Update role of a staged user
   */
  const handleStagedRoleChange = (userId, newRole) => {
    setStagedUsers((prev) =>
      prev.map((item) => (item.user.id === userId ? { ...item, role: newRole } : item))
    );
  };

  /**
   * Remove user from staged list
   */
  const handleRemoveStagedUser = (userId) => {
    setStagedUsers((prev) => prev.filter((item) => item.user.id !== userId));
  };

  /**
   * Confirm Sharing: Wrap FEK for each staged user via ECDH and save in FilePermission
   */
  const handleConfirmSharing = async () => {
    if (stagedUsers.length === 0) return;

    if (!privateKey) {
      setError('Your private encryption key is locked. Please enter your account password in the unlock box above to activate it.');
      return;
    }

    setSharing(true);
    setError('');
    setSuccess('');

    try {
      // 1. Fetch file record to get the owner's wrapped key
      const fileData = await api.files.get(file.id);
      const ownerWrappedKey = fileData.file.wrappedFileKey;

      // 2. Unwrap FEK using owner's ECDH private key
      const fek = await unwrapFileKey(ownerWrappedKey, privateKey);

      // 3. For each staged user, wrap FEK with their ECDH public key
      const sharesPayload = [];
      for (const item of stagedUsers) {
        if (!item.user.publicKey) {
          throw new Error(`User ${item.user.email} does not have an active public key.`);
        }
        const recipientWrappedKey = await wrapFileKeyForRecipient(fek, item.user.publicKey);
        sharesPayload.push({
          targetUserId: item.user.id,
          targetEmail: item.user.email,
          wrappedFileKey: recipientWrappedKey,
          role: item.role,
        });
      }

      // 4. Batch submit permissions to MongoDB FilePermission schema
      if (api.permissions.shareBatch) {
        await api.permissions.shareBatch(file.id, { shares: sharesPayload });
      } else {
        for (const shareItem of sharesPayload) {
          await api.permissions.share(file.id, shareItem);
        }
      }

      setSuccess(`File shared securely with ${stagedUsers.length} user(s)!`);
      setStagedUsers([]);
      loadData();
    } catch (err) {
      console.error('Sharing error:', err);
      setError(err.message || 'Failed to share file');
    } finally {
      setSharing(false);
    }
  };

  /**
   * Update permission role for an active user
   */
  const handleUpdateActiveRole = async (userId, newRole) => {
    setUpdatingUserId(userId);
    setError('');
    setSuccess('');
    try {
      await api.permissions.updateRole(file.id, userId, newRole);
      setPermissions((prev) =>
        prev.map((p) => (p.userId === userId ? { ...p, role: newRole } : p))
      );
      setSuccess(`Permission updated to ${newRole === 'editor' ? 'Edit' : 'View Only'}.`);
    } catch (err) {
      setError(err.message || 'Failed to update user permission');
    } finally {
      setUpdatingUserId(null);
    }
  };

  /**
   * Revoke User Access
   */
  const handleRevokeUser = async (userId, userName) => {
    if (
      !window.confirm(
        `Are you sure you want to revoke access for ${userName || 'this user'}? They will immediately lose access.`
      )
    ) {
      return;
    }

    setRevokingId(userId);
    setError('');
    setSuccess('');
    try {
      await api.permissions.revoke(file.id, userId);
      setPermissions((prev) => prev.filter((p) => p.userId !== userId));
      setSuccess('Access permission revoked successfully.');
    } catch (err) {
      setError(err.message || 'Failed to revoke access');
    } finally {
      setRevokingId(null);
    }
  };

  /**
   * Generate Zero-Knowledge Shareable Link
   */
  const handleCreateShareLink = async (e) => {
    e.preventDefault();
    if (!privateKey) {
      setError('Your private encryption key is locked. Please enter your account password in the unlock box above.');
      return;
    }

    setGeneratingLink(true);
    setError('');
    setSuccess('');

    try {
      const fileData = await api.files.get(file.id);
      const ownerWrappedKey = fileData.file.wrappedFileKey;

      const fek = await unwrapFileKey(ownerWrappedKey, privateKey);
      const fekBase64 = await exportFileKeyToBase64(fek);
      setCachedFekBase64(fekBase64);

      const res = await api.files.createShareLink(file.id, {
        wrappedFileKey: ownerWrappedKey,
        role: linkRole,
        expiresHours: expiresHours && expiresHours !== '0' ? Number(expiresHours) : null,
        maxAccessCount: maxAccessCount ? Number(maxAccessCount) : null,
      });

      const fullUrl = `${window.location.origin}/#shared/${res.shareLink.token}?key=${encodeURIComponent(
        fekBase64
      )}`;

      setNewlyCreatedLink({
        url: fullUrl,
        token: res.shareLink.token,
        role: res.shareLink.role || linkRole,
        expiresAt: res.shareLink.expiresAt,
        maxAccessCount: res.shareLink.maxAccessCount,
      });

      setSuccess(`Secure ${linkRole === 'editor' ? 'Editor' : 'Viewer'} shareable link created!`);
      loadData();
    } catch (err) {
      console.error('Create link error:', err);
      setError(err.message || 'Failed to create shareable link');
    } finally {
      setGeneratingLink(false);
    }
  };

  /**
   * Revoke Share Link
   */
  const handleRevokeLink = async (linkId) => {
    if (!window.confirm('Are you sure you want to revoke this link? Anyone with this link will immediately lose access.')) return;

    setError('');
    try {
      await api.files.revokeShareLink(file.id, linkId);
      setSuccess('Share link revoked.');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to revoke link');
    }
  };

  /**
   * Key Rotation & Re-Encryption
   */
  const handleRotateKey = async () => {
    if (
      !window.confirm(
        'Rotating the key will decrypt the file in your browser, generate a brand-new AES-256-GCM key, re-encrypt the file, and invalidate all old access keys. Continue?'
      )
    ) {
      return;
    }

    setRotatingKey(true);
    setError('');
    setSuccess('');

    try {
      const meta = await api.files.get(file.id);
      const { blob } = await api.files.download(file.id);
      const oldEncryptedBuffer = await blob.arrayBuffer();

      const oldFek = await unwrapFileKey(meta.file.wrappedFileKey, privateKey);
      const plaintextBuffer = await decryptFile(oldEncryptedBuffer, oldFek, meta.file.iv);

      const newFek = await generateFileKey();
      const { encryptedBuffer: newCiphertext, iv: newIv } = await encryptFile(plaintextBuffer, newFek);
      const newWrappedKey = await wrapFileKeyForRecipient(newFek, user.publicKey);

      const formData = new FormData();
      formData.append(
        'reEncryptedFile',
        new Blob([newCiphertext], { type: 'application/octet-stream' }),
        `${file.originalName}.enc`
      );
      formData.append('newWrappedFileKey', JSON.stringify(newWrappedKey));
      formData.append('newIv', newIv);

      await api.files.rotateKey(file.id, formData);

      setSuccess('File re-encrypted with a fresh key! All previously revoked users can no longer decrypt the file.');
      loadData();
    } catch (err) {
      console.error('Key rotation error:', err);
      setError(err.message || 'Key rotation failed');
    } finally {
      setRotatingKey(false);
    }
  };

  const copyToClipboard = async (token) => {
    let keyToUse = cachedFekBase64;
    if (!keyToUse && file?.wrappedFileKey && privateKey) {
      try {
        const fek = await unwrapFileKey(file.wrappedFileKey, privateKey);
        keyToUse = await exportFileKeyToBase64(fek);
        setCachedFekBase64(keyToUse);
      } catch (err) {
        console.warn('Could not derive key for clipboard:', err);
      }
    }

    const fullUrl = keyToUse
      ? `${window.location.origin}/#shared/${token}?key=${encodeURIComponent(keyToUse)}`
      : `${window.location.origin}/#shared/${token}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2500);
    } catch (e) {
      console.warn('Failed to copy to clipboard:', e);
    }
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl border border-slate-300 max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Share Resource</h3>
              <p className="text-[11px] text-slate-500 truncate max-w-xs sm:max-w-md">
                {file.originalName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 text-xs font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('user')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'user'
                ? 'border-[#1e40af] text-[#1e40af] font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>User Access</span>
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'link'
                ? 'border-[#1e40af] text-[#1e40af] font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Shareable Link</span>
          </button>
          <button
            onClick={() => setActiveTab('rotate')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'rotate'
                ? 'border-[#1e40af] text-[#1e40af] font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Key Rotation</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Private Key Locked Warning */}
          {!privateKey && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <Lock className="w-4 h-4 text-amber-700" />
                <span>Session Private Key Locked</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-snug">
                For zero-knowledge security, your ECDH private key is stored encrypted client-side. Enter your account password to unlock it for this session:
              </p>
              <form onSubmit={handleUnlockKey} className="flex gap-2">
                <input
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="flex-1 text-xs px-2.5 py-1.5 border border-amber-300 rounded bg-white text-slate-900"
                  required
                />
                <button
                  type="submit"
                  disabled={unlockingKey || !unlockPassword}
                  className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium rounded transition-colors flex items-center gap-1 disabled:opacity-50 shrink-0"
                >
                  {unlockingKey ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Unlocking...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Unlock Key</span>
                    </>
                  )}
                </button>
              </form>
              {unlockError && (
                <p className="text-[11px] text-red-600 font-medium">{unlockError}</p>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* TAB 1: User-to-User Email Sharing */}
          {activeTab === 'user' && (
            <div className="space-y-5">
              {/* Add User Section */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  Add people by registered email
                </label>
                <form
                  onSubmit={handleAddUserByEmail}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <div className="relative flex-1">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        if (lookupError) setLookupError('');
                      }}
                      placeholder="e.g. naitikpawar22@gmail.com"
                      className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    />
                  </div>

                  <select
                    value={defaultStagedRole}
                    onChange={(e) => setDefaultStagedRole(e.target.value)}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800 focus:outline-hidden"
                  >
                    <option value="viewer">View Only</option>
                    <option value="editor">Edit</option>
                  </select>

                  <button
                    type="submit"
                    disabled={lookingUp || !emailInput.trim()}
                    className="px-4 py-2 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
                  >
                    {lookingUp ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </form>

                {lookupError && (
                  <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{lookupError}</span>
                  </p>
                )}
              </div>

              {/* Staged Users (Added via email, awaiting confirmation) */}
              {stagedUsers.length > 0 && (
                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                    <span>Users to be added ({stagedUsers.length})</span>
                    <span className="text-[11px] font-normal text-blue-700">
                      Assign permission and confirm
                    </span>
                  </div>

                  <div className="space-y-2">
                    {stagedUsers.map((item) => (
                      <div
                        key={item.user.id}
                        className="bg-white border border-blue-200 rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {renderUserAvatar(item.user)}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {item.user.name || 'SecureVault User'}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {item.user.email}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={item.role}
                            onChange={(e) =>
                              handleStagedRoleChange(item.user.id, e.target.value)
                            }
                            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-800"
                          >
                            <option value="viewer">View Only</option>
                            <option value="editor">Edit</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleRemoveStagedUser(item.user.id)}
                            title="Remove"
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmSharing}
                    disabled={sharing}
                    className="w-full py-2 px-4 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {sharing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Wrapping Keys & Granting Access...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirm Sharing ({stagedUsers.length} users)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Who Has Access section */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#1e40af]" />
                    Who Has Access
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {permissions.length + 1} user{permissions.length !== 0 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Track when each person saw or edited this document, review created versions, and manage access roles.
                </p>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {/* File Owner Entry */}
                  <div className="p-3 bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderUserAvatar(
                          file.owner || {
                            name: user?.name,
                            email: user?.email,
                            avatar: user?.avatar,
                          }
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {file.owner?.name || user?.name || 'Owner'}
                            <span className="text-slate-400 font-normal ml-1">
                              (You)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {file.owner?.email || user?.email}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                              Full Cryptographic Control
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 font-semibold">
                              Current: v{file.currentVersion || 1}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded border border-slate-300 shrink-0">
                        Owner
                      </span>
                    </div>
                  </div>

                  {/* Active Shared Permissions */}
                  {permissions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 italic">
                      No other users have been granted access yet. Use the email field above to add people.
                    </div>
                  ) : (
                    permissions.map((p) => {
                      const userTargetId = p.userId || p.id;
                      const userLogs = fileAuditLogs.filter(
                        (l) =>
                          (l.actor?.id && (l.actor.id === userTargetId || l.actor.id === p.id)) ||
                          (l.actor?.email && p.email && l.actor.email.toLowerCase() === p.email.toLowerCase()) ||
                          (l.metadata?.targetUserId && l.metadata.targetUserId === userTargetId) ||
                          (l.metadata?.targetEmail && p.email && l.metadata.targetEmail.toLowerCase() === p.email.toLowerCase())
                      );

                      const viewLogs = userLogs.filter((l) => l.action === 'preview');
                      const editLogs = userLogs.filter((l) => l.action === 'edit');
                      const latestView = viewLogs[0];
                      const latestEdit = editLogs[0];
                      const isExpanded = !!expandedUserLogs[userTargetId];

                      return (
                        <div
                          key={p.id || userTargetId}
                          className="p-3 bg-white hover:bg-slate-50/40 transition-colors space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <div className="flex items-start gap-2.5 min-w-0">
                              {renderUserAvatar(p)}
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 truncate">
                                  {p.name || 'Registered User'}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {p.email}
                                </div>

                                {/* User Activity Summary & Log Toggle */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  {latestView ? (
                                    <span
                                      title={`Last seen on ${new Date(latestView.timestamp).toLocaleString()}`}
                                      className="inline-flex items-center gap-1 text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                                    >
                                      <Eye className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                      <span>
                                        Seen:{' '}
                                        {new Date(latestView.timestamp).toLocaleDateString([], {
                                          month: 'short',
                                          day: 'numeric',
                                        })}{' '}
                                        {new Date(latestView.timestamp).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 italic bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                      <Eye className="w-2.5 h-2.5 opacity-40 shrink-0" />
                                      <span>Not seen yet</span>
                                    </span>
                                  )}

                                  {latestEdit ? (
                                    <span
                                      title={`Edited Version v${latestEdit.metadata?.version || ''} on ${new Date(
                                        latestEdit.timestamp
                                      ).toLocaleString()}`}
                                      className="inline-flex items-center gap-1 text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 font-semibold"
                                    >
                                      <Edit3 className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                                      <span>
                                        Edited v{latestEdit.metadata?.version || '2'} (
                                        {new Date(latestEdit.timestamp).toLocaleDateString([], {
                                          month: 'short',
                                          day: 'numeric',
                                        })}
                                        )
                                      </span>
                                    </span>
                                  ) : p.role === 'editor' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                      <Edit3 className="w-2.5 h-2.5 opacity-40 shrink-0" />
                                      <span>No edits made</span>
                                    </span>
                                  ) : null}

                                  <button
                                    type="button"
                                    onClick={() => toggleUserLogs(userTargetId)}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1e40af] hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100/70 px-1.5 py-0.5 rounded border border-blue-200 transition-colors"
                                  >
                                    <History className="w-2.5 h-2.5 text-[#1e40af]" />
                                    <span>{isExpanded ? 'Hide Logs' : 'View Access & Versions'}</span>
                                    <ChevronDown
                                      className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Individual Permission Control & Revoke */}
                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={p.role || 'viewer'}
                                disabled={updatingUserId === p.userId}
                                onChange={(e) =>
                                  handleUpdateActiveRole(p.userId, e.target.value)
                                }
                                className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-800 disabled:opacity-50"
                              >
                                <option value="viewer">View Only</option>
                                <option value="editor">Edit</option>
                              </select>

                              <button
                                onClick={() => handleRevokeUser(p.userId, p.name || p.email)}
                                disabled={revokingId === p.userId}
                                title="Revoke access"
                                className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {revokingId === p.userId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Access & Version Log Drawer */}
                          {isExpanded && (
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 border-b border-slate-200 pb-1.5">
                                <span className="flex items-center gap-1.5">
                                  <History className="w-3.5 h-3.5 text-[#1e40af]" />
                                  Activity & Version Log for {p.name || p.email}
                                </span>
                                <span className="text-[10px] font-normal text-slate-500">
                                  Assigned Role: <strong className="capitalize text-slate-700">{p.role}</strong>
                                </span>
                              </div>

                              {/* Metric Overview Cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                                <div className="bg-white p-2 rounded-md border border-slate-200 space-y-0.5">
                                  <div className="text-slate-400 font-medium flex items-center gap-1">
                                    <Eye className="w-3 h-3 text-blue-500" /> First/Last Seen
                                  </div>
                                  <div className="font-semibold text-slate-800 text-[11px]">
                                    {latestView
                                      ? new Date(latestView.timestamp).toLocaleString(undefined, {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })
                                      : 'Never opened'}
                                  </div>
                                  <div className="text-[9px] text-slate-400">
                                    {viewLogs.length > 0 ? `${viewLogs.length} view session(s)` : 'Awaiting first view'}
                                  </div>
                                </div>

                                <div className="bg-white p-2 rounded-md border border-slate-200 space-y-0.5">
                                  <div className="text-slate-400 font-medium flex items-center gap-1">
                                    <Edit3 className="w-3 h-3 text-indigo-500" /> Versions & Edits
                                  </div>
                                  <div className="font-semibold text-slate-800 text-[11px]">
                                    {latestEdit
                                      ? `v${latestEdit.metadata?.version || ''} (${new Date(
                                          latestEdit.timestamp
                                        ).toLocaleDateString()})`
                                      : p.role === 'viewer'
                                      ? 'View-Only (Restricted)'
                                      : 'No edits yet'}
                                  </div>
                                  <div className="text-[9px] text-indigo-600 font-medium">
                                    {editLogs.length > 0 ? `${editLogs.length} version update(s)` : '0 versions created'}
                                  </div>
                                </div>

                                <div className="bg-white p-2 rounded-md border border-slate-200 space-y-0.5 col-span-2 sm:col-span-1">
                                  <div className="text-slate-400 font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-500" /> Access Granted
                                  </div>
                                  <div className="font-semibold text-slate-800 text-[11px]">
                                    {p.createdAt
                                      ? new Date(p.createdAt).toLocaleDateString(undefined, {
                                          dateStyle: 'medium',
                                        })
                                      : 'Active'}
                                  </div>
                                  <div className="text-[9px] text-slate-400">
                                    {p.grantedBy ? `Shared by ${p.grantedBy}` : 'Encrypted with user public key'}
                                  </div>
                                </div>
                              </div>

                              {/* Detailed Activity Events List */}
                              <div className="space-y-1">
                                <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                                  Detailed Event Timeline
                                </div>

                                {userLogs.length === 0 ? (
                                  <div className="bg-white p-2.5 rounded-md border border-slate-200 text-center text-[11px] text-slate-400 italic">
                                    No interaction events recorded for this user yet.
                                  </div>
                                ) : (
                                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                    {userLogs.map((log) => {
                                      const isEdit = log.action === 'edit';
                                      const isPreview = log.action === 'preview';
                                      const isDownload = log.action === 'download';

                                      return (
                                        <div
                                          key={log.id}
                                          className="bg-white p-2 rounded-md border border-slate-200 text-[11px] flex items-center justify-between gap-2"
                                        >
                                          <div className="flex items-center gap-2 truncate">
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                                isEdit
                                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                                  : isPreview
                                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                  : isDownload
                                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                                              }`}
                                            >
                                              {isEdit
                                                ? `EDIT (v${log.metadata?.version || '?'})`
                                                : isPreview
                                                ? 'VIEWED'
                                                : isDownload
                                                ? 'DOWNLOAD'
                                                : log.action}
                                            </span>
                                            <span className="text-slate-700 truncate">
                                              {log.metadata?.actionDetail ||
                                                (isEdit
                                                  ? `Edited file and created version v${log.metadata?.version}`
                                                  : isPreview
                                                  ? 'Viewed file in protected viewer'
                                                  : log.action)}
                                              {log.metadata?.changeSummary ? (
                                                <span className="italic text-slate-500">
                                                  {' '}
                                                  — "{log.metadata.changeSummary}"
                                                </span>
                                              ) : null}
                                            </span>
                                          </div>
                                          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0">
                                            {new Date(log.timestamp).toLocaleString(undefined, {
                                              dateStyle: 'short',
                                              timeStyle: 'short',
                                            })}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Shareable Links */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              {newlyCreatedLink && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800">
                      Link Created Successfully
                    </span>
                    <button
                      onClick={() => copyToClipboard(newlyCreatedLink.token)}
                      className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded flex items-center gap-1 transition-colors"
                    >
                      {copiedToken === newlyCreatedLink.token ? (
                        <>
                          <Check className="w-3 h-3" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy Link
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-900 bg-white p-2 rounded border border-emerald-200 break-all select-all">
                    {newlyCreatedLink.url}
                  </div>
                </div>
              )}

              <form
                onSubmit={handleCreateShareLink}
                className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200"
              >
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Generate Shareable Link
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Link Permission
                    </label>
                    <select
                      value={linkRole}
                      onChange={(e) => setLinkRole(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                    >
                      <option value="viewer">View Only</option>
                      <option value="editor">Edit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Expires After
                    </label>
                    <select
                      value={expiresHours}
                      onChange={(e) => setExpiresHours(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                    >
                      <option value="1">1 Hour</option>
                      <option value="24">24 Hours</option>
                      <option value="168">7 Days</option>
                      <option value="0">Never</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={generatingLink}
                  className="w-full py-2 bg-[#1e40af] hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {generatingLink ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating link...</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Generate Shareable Link</span>
                    </>
                  )}
                </button>
              </form>

              {/* Active Links List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Active Links ({shareLinks.length})
                </h4>

                {shareLinks.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No active share links for this file.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                    {shareLinks.map((l) => (
                      <div
                        key={l.id}
                        className="p-3 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-800 font-semibold">
                              /shared/{l.token.substring(0, 12)}...
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 border text-slate-700 uppercase font-mono">
                              {l.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Access count: {l.accessCount || 0}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(l.token)}
                            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-100 text-slate-700 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                          <button
                            onClick={() => handleRevokeLink(l.id)}
                            className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-50"
                            title="Revoke link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Key Rotation */}
          {activeTab === 'rotate' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4 text-[#1e40af]" />
                  <span>Cryptographic Key Rotation & Revocation</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When you rotate the file key, SecureVault downloads and decrypts the file payload in your browser memory, generates a fresh random 256-bit AES key, re-encrypts the file, and stores the new ciphertext. Any revoked user who might have cached previous keys will be permanently locked out.
                </p>

                <button
                  type="button"
                  onClick={handleRotateKey}
                  disabled={rotatingKey}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {rotatingKey ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Re-encrypting with new key...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Rotate Key & Re-encrypt File</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
