import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  unwrapFileKey,
  wrapFileKeyForRecipient,
} from '../utils/crypto';
import {
  CheckCircle2,
  XCircle,
  Shield,
  UserX,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Folder,
  KeyRound,
  Save,
  Check,
} from 'lucide-react';

export default function ApproveRequestModal({
  isOpen,
  onClose,
  request, // AccessRequest object
  onSuccess,
}) {
  const { privateKey, unlockPrivateKey } = useAuth();
  const [role, setRole] = useState('viewer');
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiresOption, setExpiresOption] = useState('never');
  const [customDate, setCustomDate] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Inline unlock password if privateKey is not loaded
  const [unlockPassword, setUnlockPassword] = useState('');
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState('');

  const isApproved = request?.status === 'approved';
  const isRevoked = request?.status === 'revoked';
  const isRejected = request?.status === 'rejected';

  useEffect(() => {
    if (request) {
      setRole(request.grantedRole || request.requestedRole || 'viewer');
      setAllowDownload(request.allowDownload !== undefined ? Boolean(request.allowDownload) : true);
      if (request.expiresAt) {
        setExpiresOption('custom');
        setCustomDate(new Date(request.expiresAt).toISOString().slice(0, 16));
      } else {
        setExpiresOption('never');
        setCustomDate('');
      }
      setError('');
      setShowRejectForm(false);
      setNeedsUnlock(false);
      setUnlockPassword('');
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const itemName = request.itemName || (request.targetType === 'file' ? request.file?.originalName : request.folder?.name);

  // Recursively collect all files in a folder and its subfolders
  const collectFolderFiles = async (folderId) => {
    let list = [];
    try {
      const res = await api.files.list({ folderId });
      if (res && res.files) {
        list = list.concat(res.files);
      }
      const subRes = await api.folders.list(folderId);
      if (subRes && subRes.folders) {
        for (const sub of subRes.folders) {
          const childFiles = await collectFolderFiles(sub.id);
          list = list.concat(childFiles);
        }
      }
    } catch (e) {
      console.warn('Error collecting folder files:', e);
    }
    return list;
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setLoadingStatus('Preparing encryption credentials...');

    try {
      let finalExpiresAt = null;
      if (expiresOption === 'custom' && customDate) {
        finalExpiresAt = new Date(customDate).toISOString();
      } else if (expiresOption !== 'never') {
        const hours = Number(expiresOption);
        const d = new Date();
        d.setHours(d.getHours() + hours);
        finalExpiresAt = d.toISOString();
      }

      let activePrivKey = privateKey;

      // If private key not in memory, unlock with password
      if (!activePrivKey) {
        if (!unlockPassword) {
          setNeedsUnlock(true);
          setLoading(false);
          setLoadingStatus('');
          return;
        }
        setUnlocking(true);
        setLoadingStatus('Unlocking master private key...');
        try {
          activePrivKey = await unlockPrivateKey(unlockPassword);
          setNeedsUnlock(false);
        } catch (unlockErr) {
          setError(unlockErr.message || 'Incorrect password to unlock encryption key.');
          setLoading(false);
          setUnlocking(false);
          setLoadingStatus('');
          return;
        } finally {
          setUnlocking(false);
        }
      }

      const recipientPubKey = request.requester?.publicKey;
      let wrappedFileKey = null;
      let wrappedFileKeys = [];

      // Zero-Knowledge ECDH key wrapping for recipient
      if (activePrivKey && recipientPubKey) {
        if (request.targetType === 'file') {
          setLoadingStatus('Wrapping file encryption key for recipient...');
          const fileId = request.file?._id || request.file?.id || request.targetId;
          try {
            const fileMeta = await api.files.get(fileId);
            const rawKey = fileMeta.file?.wrappedFileKey || fileMeta.file?.encryptedFileKey || request.file?.encryptedFileKey;
            if (rawKey) {
              const rawFek = await unwrapFileKey(rawKey, activePrivKey);
              wrappedFileKey = await wrapFileKeyForRecipient(rawFek, recipientPubKey);
            }
          } catch (wrapErr) {
            console.warn('Could not wrap key with ECDH:', wrapErr);
          }
        } else if (request.targetType === 'folder') {
          setLoadingStatus('Scanning folder and encrypting keys for all files...');
          const folderId = request.folder?._id || request.folder?.id || request.targetId || request.folderId;
          const folderFiles = await collectFolderFiles(folderId);

          if (folderFiles.length > 0) {
            setLoadingStatus(`Wrapping keys for ${folderFiles.length} file(s) in folder...`);
            for (const f of folderFiles) {
              try {
                const fileMeta = await api.files.get(f.id);
                const rawKey = fileMeta.file?.wrappedFileKey || fileMeta.file?.encryptedFileKey || f.wrappedFileKey || f.encryptedFileKey;
                if (rawKey) {
                  const rawFek = await unwrapFileKey(rawKey, activePrivKey);
                  const recipientWrapped = await wrapFileKeyForRecipient(rawFek, recipientPubKey);
                  wrappedFileKeys.push({
                    fileId: f.id,
                    wrappedFileKey: recipientWrapped,
                  });
                }
              } catch (err) {
                console.warn(`Could not re-wrap key for file ${f.originalName || f.id}:`, err);
              }
            }
          }
        }
      }

      setLoadingStatus('Saving permissions to database...');

      if (isApproved) {
        await api.accessRequests.update(request.id, {
          role,
          allowDownload,
          expiresAt: finalExpiresAt,
          wrappedFileKey,
          wrappedFileKeys,
        });
      } else {
        await api.accessRequests.approve(request.id, {
          role,
          allowDownload,
          expiresAt: finalExpiresAt,
          wrappedFileKey,
          wrappedFileKeys,
        });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save permissions.');
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const handleRevoke = async () => {
    const confirmMsg = `Are you sure you want to disable access for ${request.requester?.name || request.requester?.email}?\n\nThey will immediately lose access and will no longer be able to see or open this ${request.targetType}.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setLoading(true);
    setError('');
    setLoadingStatus('Disabling user access and revoking permissions in database...');

    try {
      await api.accessRequests.revoke(request.id);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to disable access.');
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError('');
    setLoadingStatus('Rejecting access request...');

    try {
      await api.accessRequests.reject(request.id, {
        reason: rejectionReason.trim(),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to reject request.');
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              showRejectForm
                ? 'bg-rose-100 text-rose-700'
                : isApproved
                ? 'bg-emerald-100 text-emerald-700'
                : isRevoked
                ? 'bg-slate-200 text-slate-700'
                : 'bg-blue-100 text-[#1e40af]'
            }`}>
              {showRejectForm ? (
                <XCircle className="w-4 h-4" />
              ) : isApproved ? (
                <Shield className="w-4 h-4" />
              ) : isRevoked ? (
                <UserX className="w-4 h-4" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {showRejectForm
                  ? 'Reject Access Request'
                  : isApproved
                  ? 'Manage Approved Access'
                  : isRevoked
                  ? 'Re-Approve Access (Currently Disabled)'
                  : isRejected
                  ? 'Re-Approve Access (Currently Rejected)'
                  : 'Review Access Request'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {request.targetType === 'file' ? 'Shared File' : 'Shared Folder'} &bull; {isApproved ? 'Active Access' : 'Access Request'}
              </p>
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
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Requester Identity Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1e40af] text-white flex items-center justify-center font-bold text-sm shrink-0">
                {request.requester?.name ? request.requester.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{request.requester?.name || 'Unknown User'}</p>
                <p className="text-[11px] text-slate-500 truncate">{request.requester?.email}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase ${
                  isApproved
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isRevoked
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : isRejected
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {request.status}
                </span>
                <span className="text-[10px] text-slate-500">
                  Requested: <span className="font-semibold text-slate-700 uppercase">{request.requestedRole}</span>
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600">
              <span className="flex items-center gap-1 font-medium text-slate-800 truncate">
                {request.targetType === 'file' ? <FileText className="w-3.5 h-3.5 text-blue-600" /> : <Folder className="w-3.5 h-3.5 text-amber-600" />}
                <span className="truncate">{itemName}</span>
              </span>
              <span className="text-slate-400 shrink-0">
                {new Date(request.requestDate).toLocaleDateString()} {new Date(request.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {request.message && (
              <p className="text-[11px] italic text-slate-600 bg-white p-2 rounded-lg border border-slate-200/80">
                "{request.message}"
              </p>
            )}
          </div>

          {!showRejectForm ? (
            /* Permissions Form */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Role Switcher */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Permission Role:
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af] font-semibold text-slate-800"
                  >
                    <option value="viewer">Viewer (View & Preview Only)</option>
                    <option value="editor">Editor (View, Edit & Upload)</option>
                  </select>
                </div>

                {/* Expiration */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Access Expiration:</label>
                  <select
                    value={expiresOption}
                    onChange={(e) => setExpiresOption(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af]"
                  >
                    <option value="never">No Expiration</option>
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="168">7 Days</option>
                    <option value="720">30 Days</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>
              </div>

              {expiresOption === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Expiration Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl focus:outline-hidden focus:border-[#1e40af]"
                  />
                </div>
              )}

              {/* Download Restriction */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Download Permissions</p>
                  <p className="text-[11px] text-slate-500">
                    {allowDownload ? 'Recipient can download the file to their device' : 'Recipient can only preview in browser (no download)'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="w-4 h-4 text-[#1e40af] rounded-sm focus:ring-[#1e40af] cursor-pointer"
                />
              </div>

              {/* Master Password Unlock if privateKey not in memory */}
              {(!privateKey || needsUnlock) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold">
                    <KeyRound className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Master Password Required for End-to-End Key Encryption</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Your password unlocks your private key in memory to securely re-wrap the file encryption keys for {request.requester?.name || 'this recipient'}.
                  </p>
                  <input
                    type="password"
                    placeholder="Enter your account password"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-amber-300 rounded-lg bg-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              )}

              {loadingStatus && (
                <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 p-2.5 rounded-xl border border-blue-100">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                  <span>{loadingStatus}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {isApproved ? (
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 transition-colors disabled:opacity-50"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Disable Access</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(true)}
                    disabled={loading}
                    className="px-3.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 transition-colors disabled:opacity-50"
                  >
                    Reject Request...
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading || unlocking}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 ${
                      isApproved
                        ? 'bg-[#1e40af] hover:bg-blue-800'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isApproved ? (
                      <Save className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>{isApproved ? 'Save Permissions' : isRevoked || isRejected ? 'Restore & Approve' : 'Approve Access'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Reject Form */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason (Optional):
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Unauthorized request or incorrect permission level requested."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:outline-hidden focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100"
                >
                  Back to Permissions
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    <span>Confirm Rejection</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
