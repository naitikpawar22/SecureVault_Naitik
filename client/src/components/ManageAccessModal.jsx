import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Users,
  Shield,
  Trash2,
  Edit2,
  Clock,
  Download,
  AlertCircle,
  Loader2,
  X,
  Check,
  Link as LinkIcon,
  ToggleLeft,
  ToggleRight,
  History,
  FileText,
  Folder,
  Eye,
  ShieldAlert,
  Info,
} from 'lucide-react';
import VersionHistoryModal from './VersionHistoryModal';

export default function ManageAccessModal({
  isOpen,
  onClose,
  targetType = 'file', // 'file' | 'folder'
  targetId,
  targetName = '',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('recipients'); // 'recipients' | 'links' | 'history'
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Updating permission state
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [revokingUserId, setRevokingUserId] = useState(null);

  useEffect(() => {
    if (isOpen && targetId) {
      loadAccessData();
    }
  }, [isOpen, targetId, targetType]);

  const loadAccessData = async () => {
    setLoading(true);
    setError('');
    try {
      let res;
      if (targetType === 'file') {
        res = await api.manageAccess.getFile(targetId);
      } else {
        res = await api.manageAccess.getFolder(targetId);
      }
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load access management data.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePermission = async (userId, newFields) => {
    setUpdatingUserId(userId);
    setError('');
    setSuccess('');
    try {
      if (targetType === 'file') {
        await api.manageAccess.updateFilePermission(targetId, userId, newFields);
      } else {
        await api.manageAccess.updateFolderPermission(targetId, userId, newFields);
      }
      setSuccess('Permissions updated successfully.');
      loadAccessData();
    } catch (err) {
      setError(err.message || 'Failed to update permissions.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRevokeRecipient = async (userId, recipientName) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${recipientName}? They will immediately lose access.`)) {
      return;
    }

    setRevokingUserId(userId);
    setError('');
    setSuccess('');
    try {
      if (targetType === 'file') {
        await api.manageAccess.revokeFileRecipient(targetId, userId);
      } else {
        await api.folders.revokePermission(targetId, userId);
      }
      setSuccess('Recipient access revoked immediately.');
      loadAccessData();
    } catch (err) {
      setError(err.message || 'Failed to revoke access.');
    } finally {
      setRevokingUserId(null);
    }
  };

  const handleToggleLinkDisabled = async (linkId, currentDisabled) => {
    setError('');
    setSuccess('');
    try {
      if (targetType === 'file') {
        await api.manageAccess.updateFileShareLink(targetId, linkId, {
          isDisabled: !currentDisabled,
        });
      } else {
        await api.manageAccess.updateFolderShareLink(targetId, linkId, {
          isDisabled: !currentDisabled,
        });
      }
      setSuccess(`Share link ${!currentDisabled ? 'disabled' : 'enabled'}.`);
      loadAccessData();
    } catch (err) {
      setError(err.message || 'Failed to update share link.');
    }
  };

  const handleRevokeShareLink = async (linkId) => {
    if (!window.confirm('Are you sure you want to revoke this share link? Anyone attempting to use it will be denied access.')) {
      return;
    }
    setError('');
    try {
      if (targetType === 'file') {
        await api.files.revokeShareLink(targetId, linkId);
      } else {
        await api.folders.revokeShareLink(targetId, linkId);
      }
      setSuccess('Share link revoked.');
      loadAccessData();
    } catch (err) {
      setError(err.message || 'Failed to revoke link.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Manage Access: {targetName || (targetType === 'file' ? data?.file?.originalName : data?.folder?.name)}
              </h3>
              <p className="text-[11px] text-slate-500">
                Control permissions, download access, links, and revocation
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

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-4 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('recipients')}
            className={`pb-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'recipients'
                ? 'border-[#1e40af] text-[#1e40af]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Approved Recipients ({data?.approvedRecipients?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('links')}
            className={`pb-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'links'
                ? 'border-[#1e40af] text-[#1e40af]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Share Links ({data?.shareLinks?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-[#1e40af] text-[#1e40af]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Activity & Versions
          </button>
        </div>

        {/* Body Area */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-[#1e40af] animate-spin" />
              <p className="text-xs text-slate-500">Loading access data...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: RECIPIENTS */}
              {activeTab === 'recipients' && (
                <div className="space-y-4">
                  {/* Revocation notice */}
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                    <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">
                      Revoking access immediately terminates future access, previews, downloads, and key retrieval. Note that revocation cannot erase copies or keys already downloaded to a recipient's device.
                    </p>
                  </div>

                  {data?.approvedRecipients?.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500">
                      No approved recipients yet. When you approve access requests or share with users, they will appear here.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.approvedRecipients.map((r) => (
                        <div
                          key={r.id || r.userId}
                          className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#1e40af] text-white flex items-center justify-center font-bold text-xs shrink-0">
                              {r.name ? r.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{r.name}</p>
                              <p className="text-[11px] text-slate-500 truncate">{r.email}</p>
                              {r.expiresAt && (
                                <p className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Expires: {new Date(r.expiresAt).toLocaleDateString()}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Role selector */}
                            <select
                              value={r.role}
                              disabled={updatingUserId === r.userId}
                              onChange={(e) => handleUpdatePermission(r.userId, { role: e.target.value })}
                              className="text-xs py-1 px-2.5 border border-slate-300 rounded-lg bg-white"
                            >
                              <option value="viewer">View Only</option>
                              <option value="editor">Editor</option>
                            </select>

                            {/* Download toggle */}
                            <button
                              type="button"
                              disabled={updatingUserId === r.userId}
                              onClick={() => handleUpdatePermission(r.userId, { allowDownload: !r.allowDownload })}
                              title={r.allowDownload ? 'Download Allowed (Click to Block)' : 'Download Blocked (Click to Allow)'}
                              className={`flex items-center gap-1 py-1 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                                r.allowDownload
                                  ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                              }`}
                            >
                              <Download className="w-3 h-3" />
                              <span>{r.allowDownload ? 'Download Allowed' : 'Download Blocked'}</span>
                            </button>

                            {/* Revoke button */}
                            <button
                              type="button"
                              disabled={revokingUserId === r.userId}
                              onClick={() => handleRevokeRecipient(r.userId, r.name)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200"
                              title="Revoke Access"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SHARE LINKS */}
              {activeTab === 'links' && (
                <div className="space-y-3">
                  {data?.shareLinks?.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500">
                      No active share links. Generate a link using the Generate Link button.
                    </div>
                  ) : (
                    data.shareLinks.map((l) => (
                      <div
                        key={l.id}
                        className={`p-3.5 border rounded-xl space-y-2 transition-all ${
                          l.isDisabled ? 'bg-slate-100/70 border-slate-300 opacity-75' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <LinkIcon className="w-4 h-4 text-[#1e40af] shrink-0" />
                            <span className="font-mono text-xs text-slate-800 truncate">
                              token: {l.token.substring(0, 16)}...
                            </span>
                            {l.isDisabled && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                                Disabled
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleLinkDisabled(l.id, l.isDisabled)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                            >
                              {l.isDisabled ? 'Enable Link' : 'Disable Link'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeShareLink(l.id)}
                              className="p-1 text-rose-600 hover:text-rose-800 rounded-lg border border-rose-200 hover:bg-rose-50"
                              title="Revoke Permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
                          <span>Role: <strong>{l.role}</strong></span>
                          <span>Downloads: <strong>{l.allowDownload ? 'Allowed' : 'Blocked'}</strong></span>
                          <span>Expires: <strong>{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : 'Never'}</strong></span>
                          <span>Uses: <strong>{l.accessCount}</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: ACTIVITY & VERSIONS */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {targetType === 'file' && (
                    <div className="flex items-center justify-between p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          File Versions (Current: v{data?.file?.currentVersion || 1})
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {data?.versions?.length || 1} version(s) preserved in S3
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowVersionHistory(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1e40af] hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Open Version History</span>
                      </button>
                    </div>
                  )}

                  {/* Audit Logs list */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800">Recent Security & Access Logs:</h4>
                    {data?.auditLogs?.length === 0 ? (
                      <p className="text-xs text-slate-400">No activity recorded yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                        {data.auditLogs.map((log) => (
                          <div key={log.id} className="p-2.5 text-[11px] flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-slate-800 capitalize mr-2">
                                {log.action.replace(/_/g, ' ')}
                              </span>
                              <span className="text-slate-500">by {log.actor?.name || 'System'}</span>
                            </div>
                            <span className="text-slate-400 shrink-0">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Embedded Version History Modal */}
      {showVersionHistory && (
        <VersionHistoryModal
          isOpen={showVersionHistory}
          onClose={() => setShowVersionHistory(false)}
          fileId={targetId}
          fileName={targetName || data?.file?.originalName}
          isOwner={true}
        />
      )}
    </div>
  );
}
