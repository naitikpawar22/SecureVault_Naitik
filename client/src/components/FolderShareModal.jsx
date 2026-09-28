import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  unwrapFileKey,
  wrapFileKeyForRecipient,
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
  Clock,
  ShieldAlert,
  KeyRound,
  Users,
  Folder,
  Eye,
  Edit3,
  History,
  ChevronDown,
  Shield,
} from 'lucide-react';

export default function FolderShareModal({ folder, isOpen, onClose }) {
  const { privateKey, unlockPrivateKey } = useAuth();
  const [activeTab, setActiveTab] = useState('user'); // 'user' | 'link'
  const [recipientEmail, setRecipientEmail] = useState('');
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailLookupError, setEmailLookupError] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [shareLinks, setShareLinks] = useState([]);
  const [folderAuditLogs, setFolderAuditLogs] = useState([]);
  const [expandedUserLogs, setExpandedUserLogs] = useState({});
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

  // Link generator options
  const [linkRole, setLinkRole] = useState('viewer');
  const [expiresHours, setExpiresHours] = useState('24');
  const [newlyCreatedLink, setNewlyCreatedLink] = useState(null);

  // Inline Key Unlock State
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockingKey, setUnlockingKey] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  useEffect(() => {
    if (isOpen && folder) {
      loadData();
      setVerifiedUser(null);
      setRecipientEmail('');
      setEmailLookupError('');
    }
  }, [isOpen, folder]);

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
      const [permsRes, linksRes, auditRes] = await Promise.all([
        api.folders.listPermissions(folder.id).catch(() => ({ permissions: [] })),
        api.folders.listShareLinks(folder.id).catch(() => ({ links: [] })),
        api.folders.getLogs(folder.id).catch(() => ({ logs: [] })),
      ]);
      setPermissions(permsRes.permissions || []);
      setShareLinks(linksRes.links || []);
      setFolderAuditLogs(auditRes.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to load folder sharing data');
    } finally {
      setLoading(false);
    }
  };

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

  const handleVerifyEmail = async (e) => {
    if (e) e.preventDefault();
    setEmailLookupError('');
    setError('');
    const email = recipientEmail.trim().toLowerCase();
    if (!email) {
      setEmailLookupError('Please enter a registered email address.');
      return;
    }
    setVerifyingEmail(true);
    try {
      const res = await api.users.lookup(email);
      setVerifiedUser(res.user);
      setEmailLookupError('');
    } catch (err) {
      setEmailLookupError(err.message || `No registered user found with the email "${email}".`);
      setVerifiedUser(null);
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleShareWithUser = async (e) => {
    e.preventDefault();
    if (!verifiedUser) {
      setError('Please enter and verify a registered user email address.');
      return;
    }

    setSharing(true);
    setError('');
    setSuccess('');

    try {
      const targetUser = verifiedUser;

      // Recursively fetch all files inside this folder and any subfolders
      const collectAllFiles = async (fId) => {
        let list = [];
        const [filesRes, foldersRes] = await Promise.all([
          api.files.list({ folderId: fId }).catch(() => ({ files: [] })),
          api.folders.list(fId).catch(() => ({ folders: [] })),
        ]);
        if (filesRes.files) list.push(...filesRes.files);
        if (foldersRes.folders && foldersRes.folders.length > 0) {
          for (const sub of foldersRes.folders) {
            const subFiles = await collectAllFiles(sub.id);
            list.push(...subFiles);
          }
        }
        return list;
      };

      const folderFiles = await collectAllFiles(folder.id);

      let wrappedFileKeys = [];
      if (folderFiles.length > 0) {
        if (!privateKey) {
          throw new Error('Please unlock your private key below before sharing encrypted files in this folder.');
        }

        for (const file of folderFiles) {
          try {
            // Get full file record with wrapped key
            const fileDetail = await api.files.get(file.id);
            const rawWrappedKey = fileDetail.file.wrappedFileKey || file.wrappedFileKey;
            if (rawWrappedKey) {
              const fek = await unwrapFileKey(rawWrappedKey, privateKey);
              const recipientWrappedKey = await wrapFileKeyForRecipient(fek, targetUser.publicKey);
              wrappedFileKeys.push({
                fileId: file.id,
                wrappedFileKey: recipientWrappedKey,
              });
            }
          } catch (keyErr) {
            console.warn(`Could not re-wrap key for file ${file.originalName}:`, keyErr);
          }
        }
      }

      await api.folders.share(folder.id, {
        targetUserId: verifiedUser.id,
        role,
        wrappedFileKeys,
      });

      setSuccess(`Folder "${folder.name}" shared securely with ${verifiedUser.email}.`);
      setVerifiedUser(null);
      setRecipientEmail('');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to share folder');
    } finally {
      setSharing(false);
    }
  };

  const handleRevokePermission = async (userId) => {
    if (!window.confirm('Are you sure you want to revoke this user\'s access to the folder?')) return;
    setRevokingId(userId);
    setError('');
    try {
      await api.folders.revokePermission(folder.id, userId);
      setSuccess('Access revoked successfully.');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to revoke access');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCreateShareLink = async (e) => {
    e.preventDefault();
    setGeneratingLink(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.folders.createShareLink(folder.id, {
        role: linkRole,
        expiresHours: expiresHours ? Number(expiresHours) : null,
      });

      const fullUrl = `${window.location.origin}/#shared/${res.shareLink.token}`;
      setNewlyCreatedLink({
        ...res.shareLink,
        url: fullUrl,
      });

      setSuccess('Folder share link generated successfully!');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create share link');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleRevokeShareLink = async (linkId) => {
    if (!window.confirm('Revoke this folder share link immediately?')) return;
    setRevokingId(linkId);
    setError('');
    try {
      await api.folders.revokeShareLink(folder.id, linkId);
      setSuccess('Share link revoked.');
      if (newlyCreatedLink && newlyCreatedLink.id === linkId) {
        setNewlyCreatedLink(null);
      }
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to revoke link');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = (text, tokenKey) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(tokenKey);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  if (!isOpen || !folder) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3 truncate">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1e40af] flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 fill-blue-500/20" />
            </div>
            <div className="truncate">
              <h3 className="font-semibold text-sm sm:text-base text-slate-900 truncate">
                Share Folder "{folder.name}"
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {folder.itemCount || 0} {folder.itemCount === 1 ? 'item' : 'items'} inside • E2EE Zero-Knowledge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* Missing Key Banner */}
        {!privateKey && (
          <div className="mx-5 mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <KeyRound className="w-4 h-4 text-amber-700" />
              <span>Private Encryption Key Locked</span>
            </div>
            <p className="text-[11px] text-amber-800">
              Enter your vault password to unlock your key and wrap folder file keys for recipients:
            </p>
            <form onSubmit={handleUnlockKey} className="flex gap-2 pt-1">
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Vault Password"
                className="flex-1 text-xs px-3 py-1.5 border border-amber-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={unlockingKey || !unlockPassword}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-lg text-xs flex items-center gap-1 disabled:opacity-50"
              >
                {unlockingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Unlock'}
              </button>
            </form>
            {unlockError && <p className="text-[11px] text-red-600">{unlockError}</p>}
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 px-5 pt-3 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('user')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'user'
                ? 'border-[#1e40af] text-[#1e40af]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Share with User</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'link'
                ? 'border-[#1e40af] text-[#1e40af]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Shareable Link</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'user' && (
            <div className="space-y-4">
              {/* Share form with email lookup */}
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <label className="block text-xs font-semibold text-slate-800">
                  Share with registered user
                </label>
                <form onSubmit={handleVerifyEmail} className="flex gap-2">
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => {
                      setRecipientEmail(e.target.value);
                      if (emailLookupError) setEmailLookupError('');
                    }}
                    placeholder="Enter email (e.g. naitikpawar22@gmail.com)"
                    className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:border-[#1e40af]"
                  />
                  <button
                    type="submit"
                    disabled={verifyingEmail || !recipientEmail.trim()}
                    className="px-3 py-2 bg-[#1e40af] hover:bg-blue-800 text-white rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    {verifyingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>Lookup</span>
                  </button>
                </form>

                {emailLookupError && (
                  <p className="text-[11px] text-red-600 font-medium">{emailLookupError}</p>
                )}

                {verifiedUser && (
                  <form onSubmit={handleShareWithUser} className="pt-2 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{verifiedUser.name}</div>
                        <div className="text-[11px] text-slate-500">{verifiedUser.email}</div>
                      </div>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800"
                      >
                        <option value="viewer">Viewer (Read-only)</option>
                        <option value="editor">Editor (Full access)</option>
                      </select>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={sharing}
                        className="px-4 py-2 bg-[#1e40af] hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                      >
                        {sharing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" />
                        )}
                        <span>Confirm Folder Sharing</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Active Permissions List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#1e40af]" />
                    Who Has Access
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {permissions.length} user{permissions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Track when each collaborator accessed or opened this folder, and manage their assigned permissions.
                </p>

                {loading ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin mx-auto" />
                  </div>
                ) : permissions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    This folder is private and not shared with any specific users yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {permissions.map((p) => {
                      const userTargetId = p.userId || p.id;
                      const userLogs = folderAuditLogs.filter(
                        (l) =>
                          (l.actor?.id && (l.actor.id === userTargetId || l.actor.id === p.id)) ||
                          (l.actor?.email && p.email && l.actor.email.toLowerCase() === p.email.toLowerCase()) ||
                          (l.metadata?.targetUserId && l.metadata.targetUserId === userTargetId) ||
                          (l.metadata?.targetEmail && p.email && l.metadata.targetEmail.toLowerCase() === p.email.toLowerCase())
                      );

                      const accessLogs = userLogs.filter((l) => l.action === 'folder_access');
                      const latestAccess = accessLogs[0];
                      const isExpanded = !!expandedUserLogs[userTargetId];

                      return (
                        <div key={userTargetId} className="p-3 bg-white hover:bg-slate-50/40 transition-colors space-y-2.5">
                          <div className="flex items-start justify-between gap-3 text-xs">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                {p.name ? p.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 truncate">{p.name || 'User'}</div>
                                <div className="text-[11px] text-slate-500 font-mono truncate">{p.email}</div>

                                {/* Activity Summary & Toggle */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  {latestAccess ? (
                                    <span
                                      title={`Last accessed on ${new Date(latestAccess.timestamp).toLocaleString()}`}
                                      className="inline-flex items-center gap-1 text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                                    >
                                      <Eye className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                      <span>
                                        Seen:{' '}
                                        {new Date(latestAccess.timestamp).toLocaleDateString([], {
                                          month: 'short',
                                          day: 'numeric',
                                        })}{' '}
                                        {new Date(latestAccess.timestamp).toLocaleTimeString([], {
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

                                  <button
                                    type="button"
                                    onClick={() => toggleUserLogs(userTargetId)}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1e40af] hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100/70 px-1.5 py-0.5 rounded border border-blue-200 transition-colors"
                                  >
                                    <History className="w-2.5 h-2.5 text-[#1e40af]" />
                                    <span>{isExpanded ? 'Hide Log' : 'View Access Log'}</span>
                                    <ChevronDown
                                      className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wider bg-blue-50 text-[#1e40af] border border-blue-200">
                                {p.role}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRevokePermission(p.userId)}
                                disabled={revokingId === p.userId}
                                title="Revoke access"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {revokingId === p.userId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Access Timeline Drawer */}
                          {isExpanded && (
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 border-b border-slate-200 pb-1.5">
                                <span className="flex items-center gap-1.5">
                                  <History className="w-3.5 h-3.5 text-[#1e40af]" />
                                  Folder Access Log for {p.name || p.email}
                                </span>
                                <span className="text-[10px] font-normal text-slate-500">
                                  Role: <strong className="capitalize text-slate-700">{p.role}</strong>
                                </span>
                              </div>

                              {/* Metric Overview Cards */}
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="bg-white p-2 rounded-md border border-slate-200 space-y-0.5">
                                  <div className="text-slate-400 font-medium flex items-center gap-1">
                                    <Eye className="w-3 h-3 text-blue-500" /> Last Seen / Opened
                                  </div>
                                  <div className="font-semibold text-slate-800 text-[11px]">
                                    {latestAccess
                                      ? new Date(latestAccess.timestamp).toLocaleString(undefined, {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })
                                      : 'Never opened'}
                                  </div>
                                  <div className="text-[9px] text-slate-400">
                                    {accessLogs.length > 0 ? `${accessLogs.length} folder access session(s)` : 'Awaiting first visit'}
                                  </div>
                                </div>

                                <div className="bg-white p-2 rounded-md border border-slate-200 space-y-0.5">
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
                                    {p.grantedBy ? `Shared by ${p.grantedBy}` : 'Cascaded folder permission'}
                                  </div>
                                </div>
                              </div>

                              {/* Detailed Activity Events List */}
                              <div className="space-y-1">
                                <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                                  Access Events Timeline
                                </div>

                                {userLogs.length === 0 ? (
                                  <div className="bg-white p-2.5 rounded-md border border-slate-200 text-center text-[11px] text-slate-400 italic">
                                    No folder access events recorded yet for this user.
                                  </div>
                                ) : (
                                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                    {userLogs.map((log) => {
                                      const isAccess = log.action === 'folder_access';
                                      const isShare = log.action === 'folder_share';

                                      return (
                                        <div
                                          key={log.id}
                                          className="bg-white p-2 rounded-md border border-slate-200 text-[11px] flex items-center justify-between gap-2"
                                        >
                                          <div className="flex items-center gap-2 truncate">
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                                isAccess
                                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                  : isShare
                                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                                              }`}
                                            >
                                              {isAccess ? 'OPENED FOLDER' : isShare ? 'ACCESS GRANTED' : log.action}
                                            </span>
                                            <span className="text-slate-700 truncate">
                                              {log.metadata?.actionDetail ||
                                                (isAccess
                                                  ? 'Opened and viewed shared folder'
                                                  : isShare
                                                  ? 'Access permission granted'
                                                  : log.action)}
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
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'link' && (
            <div className="space-y-4">
              {/* Link generator form */}
              <form onSubmit={handleCreateShareLink} className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Link Role Permission
                    </label>
                    <select
                      value={linkRole}
                      onChange={(e) => setLinkRole(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-hidden"
                    >
                      <option value="viewer">Viewer (View & Browse files)</option>
                      <option value="editor">Editor (View, Download & Add)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Link Expiration
                    </label>
                    <select
                      value={expiresHours}
                      onChange={(e) => setExpiresHours(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-hidden"
                    >
                      <option value="1">1 hour</option>
                      <option value="24">24 hours (1 day)</option>
                      <option value="168">7 days</option>
                      <option value="">Never expire</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={generatingLink}
                    className="px-4 py-2 bg-[#1e40af] hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {generatingLink ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LinkIcon className="w-3.5 h-3.5" />
                    )}
                    <span>Create Share Link</span>
                  </button>
                </div>
              </form>

              {/* Newly Created Link Display */}
              {newlyCreatedLink && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1e40af] flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5" /> Active Link Ready
                    </span>
                    <span className="text-[10px] font-mono text-blue-700 uppercase px-1.5 py-0.5 bg-blue-100 rounded">
                      {newlyCreatedLink.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newlyCreatedLink.url}
                      className="flex-1 text-xs px-3 py-1.5 border border-blue-200 rounded-lg bg-white font-mono text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(newlyCreatedLink.url, 'new')}
                      className="px-3 py-1.5 bg-[#1e40af] text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-blue-800 transition-colors"
                    >
                      {copiedToken === 'new' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Links */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700">Existing Share Links</h4>
                {shareLinks.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No active shareable links for this folder.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {shareLinks.map((l) => {
                      const linkUrl = `${window.location.origin}/#shared/${l.token}`;
                      return (
                        <div key={l.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="truncate flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-700 truncate">{l.token.slice(0, 16)}...</span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase font-semibold">
                                {l.role}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {l.expiresAt ? `Expires: ${new Date(l.expiresAt).toLocaleString()}` : 'Never expires'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(linkUrl, l.id)}
                              className="px-2.5 py-1 text-slate-600 hover:text-[#1e40af] hover:bg-blue-50 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              {copiedToken === l.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedToken === l.id ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeShareLink(l.id)}
                              disabled={revokingId === l.id}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              {revokingId === l.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
