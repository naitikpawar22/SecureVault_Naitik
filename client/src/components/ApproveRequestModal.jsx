import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  unwrapFileKey,
  wrapFileKeyForRecipient,
  exportFileKeyToBase64,
} from '../utils/crypto';
import {
  CheckCircle2,
  XCircle,
  Shield,
  Lock,
  User,
  Clock,
  Download,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Folder,
  KeyRound,
} from 'lucide-react';

export default function ApproveRequestModal({
  isOpen,
  onClose,
  request, // AccessRequest object
  onSuccess,
}) {
  const { privateKey, unlockPrivateKey } = useAuth();
  const [role, setRole] = useState(request?.requestedRole || 'viewer');
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
  const [error, setError] = useState('');

  if (!isOpen || !request) return null;

  const itemName = request.itemName || (request.targetType === 'file' ? request.file?.originalName : request.folder?.name);

  const handleApprove = async () => {
    setLoading(true);
    setError('');

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

      let wrappedFileKey = null;

      // For a file, wrap the encryption key for the recipient using ECDH zero-knowledge
      if (request.targetType === 'file' && request.file) {
        let activePrivKey = privateKey;

        // If private key not in memory, prompt unlock
        if (!activePrivKey) {
          if (!unlockPassword) {
            setNeedsUnlock(true);
            setLoading(false);
            return;
          }
          setUnlocking(true);
          try {
            activePrivKey = await unlockPrivateKey(unlockPassword);
            setNeedsUnlock(false);
          } catch (unlockErr) {
            setError(unlockErr.message || 'Incorrect password to unlock encryption key.');
            setLoading(false);
            setUnlocking(false);
            return;
          } finally {
            setUnlocking(false);
          }
        }

        // Wrap file key for recipient
        if (activePrivKey && request.requester?.publicKey && request.file.encryptedFileKey) {
          try {
            const rawFek = await unwrapFileKey(request.file.encryptedFileKey, activePrivKey);
            wrappedFileKey = await wrapFileKeyForRecipient(rawFek, request.requester.publicKey);
          } catch (wrapErr) {
            console.warn('Could not wrap key with ECDH, using fallback:', wrapErr);
          }
        }
      }

      await api.accessRequests.approve(request.id, {
        role,
        allowDownload,
        expiresAt: finalExpiresAt,
        wrappedFileKey,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to approve request.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError('');

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
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {showRejectForm ? 'Reject Access Request' : 'Review Access Request'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {request.targetType === 'file' ? 'Shared File' : 'Shared Folder'}
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
        <div className="p-6 space-y-4">
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
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                {request.requestedRole} Requested
              </span>
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
            /* Approve Form */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Final Role */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Grant Access Role:</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af]"
                  >
                    <option value="viewer">View Only (Preview)</option>
                    <option value="editor">Editor (View, Edit & Update)</option>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Expiration Date:</label>
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
                    {allowDownload ? 'Recipient can download the file to device' : 'Recipient can only preview in browser'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="w-4 h-4 text-[#1e40af] rounded-sm focus:ring-[#1e40af]"
                />
              </div>

              {/* Key Unlock if needed */}
              {(!privateKey || needsUnlock) && request.targetType === 'file' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold">
                    <KeyRound className="w-4 h-4 text-amber-700" />
                    <span>Master Password Required for Zero-Knowledge Key Wrapping</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Your private key will wrap the file key securely for the recipient's public key in browser memory.
                  </p>
                  <input
                    type="password"
                    placeholder="Enter your account password"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-amber-300 rounded-lg bg-white"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 transition-colors"
                >
                  Reject Request...
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
                    onClick={handleApprove}
                    disabled={loading || unlocking}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Approve Access</span>
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
                  Back to Approval
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
