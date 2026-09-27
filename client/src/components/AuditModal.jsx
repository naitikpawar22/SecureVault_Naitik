import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  X,
  History,
  Shield,
  AlertCircle,
  Loader2,
  GitBranch,
  RotateCcw,
  CheckCircle2,
  Calendar,
  User,
  ArrowRight,
} from 'lucide-react';

export default function AuditModal({ file, isOpen, onClose, onRefreshFile, initialTab = 'audit' }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'audit'); // 'audit' | 'versions'
  const [logs, setLogs] = useState([]);
  const [versions, setVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [restoringVersion, setRestoringVersion] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen && file) {
      if (initialTab) setActiveTab(initialTab);
      loadData();
    }
  }, [isOpen, file, initialTab]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [logsRes, versionsRes] = await Promise.all([
        api.audit.getFileLogs(file.id),
        api.files.listVersions ? api.files.listVersions(file.id) : Promise.resolve({ versions: [] }),
      ]);
      setLogs(logsRes.logs || []);
      setVersions(versionsRes.versions || []);
      setCurrentVersion(versionsRes.currentVersion || file.currentVersion || 1);
    } catch (err) {
      setError(err.message || 'Failed to load audit records and version history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreVersion = async (versionNumber) => {
    if (
      !window.confirm(
        `Are you sure you want to restore Version ${versionNumber}? This will create a new current version from Version ${versionNumber}.`
      )
    ) {
      return;
    }

    setRestoringVersion(versionNumber);
    setError('');
    setSuccess('');
    try {
      await api.files.restoreVersion(file.id, versionNumber);
      setSuccess(`Version ${versionNumber} restored successfully!`);
      await loadData();
      if (onRefreshFile) onRefreshFile();
    } catch (err) {
      setError(err.message || `Failed to restore version ${versionNumber}`);
    } finally {
      setRestoringVersion(null);
    }
  };

  if (!isOpen || !file) return null;

  const getActionBadge = (action) => {
    switch (action) {
      case 'upload':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'edit':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'download':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'share':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'revoke':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'delete':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'file_rename':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'preview':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl border border-slate-300 max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Audit Trail & History
              </h3>
              <p className="text-[11px] text-slate-500 truncate max-w-sm sm:max-w-md">
                {file.originalName} • v{file.currentVersion || currentVersion}
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

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 text-xs font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-[#1e40af] text-[#1e40af] font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity Log ({logs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'versions'
                ? 'border-[#1e40af] text-[#1e40af] font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Version History ({versions.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
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

          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 text-[#1e40af] animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Loading audit records and version history...</p>
            </div>
          ) : activeTab === 'audit' ? (
            /* TAB 1: Activity Log Table */
            logs.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">
                No activity logs recorded for this file yet.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Actor / User</th>
                      <th className="px-4 py-3">Details</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${getActionBadge(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          <div className="font-semibold">{log.actor?.name || 'User'}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {log.actor?.email}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {log.metadata?.actionDetail ? (
                            <div className="font-medium text-slate-800">
                              {log.metadata.actionDetail}
                            </div>
                          ) : null}

                          <div className="text-[11px] text-slate-500 space-x-2 mt-0.5">
                            {log.metadata?.version && (
                              <span className="font-semibold text-indigo-700">
                                v{log.metadata.version}
                              </span>
                            )}
                            {log.metadata?.recipientEmail && (
                              <span>
                                Recipient: {log.metadata.recipientEmail}
                                {log.metadata.role ? ` (${log.metadata.role})` : ''}
                              </span>
                            )}
                            {log.metadata?.revokedEmail && (
                              <span className="text-amber-800">
                                Revoked: {log.metadata.revokedEmail}
                              </span>
                            )}
                            {log.metadata?.size && (
                              <span>
                                Size: {(log.metadata.size / 1024).toFixed(1)} KB
                              </span>
                            )}
                            {log.metadata?.changeSummary && (
                              <span className="italic text-slate-600">
                                "{log.metadata.changeSummary}"
                              </span>
                            )}
                            {!log.metadata?.actionDetail &&
                              !log.metadata?.recipientEmail &&
                              !log.metadata?.revokedEmail &&
                              !log.metadata?.size &&
                              !log.metadata?.changeSummary && (
                                <span className="text-slate-400">—</span>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* TAB 2: Version History */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  All encrypted historical revisions stored for this document.
                </span>
                <span className="font-semibold text-slate-700">
                  Current Version: v{currentVersion}
                </span>
              </div>

              {versions.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">
                  No versions recorded yet.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {versions.map((v) => {
                    const isCurrent = v.isCurrent || v.versionNumber === currentVersion;
                    return (
                      <div
                        key={v.id || v.versionNumber}
                        className={`p-4 flex items-center justify-between gap-3 text-xs ${
                          isCurrent ? 'bg-emerald-50/40' : 'hover:bg-slate-50/70'
                        } transition-colors`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`px-2 py-1 rounded font-mono text-[11px] font-bold border shrink-0 ${
                              isCurrent
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            v{v.versionNumber}
                            {isCurrent && ' • Current'}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                              <span>{v.changeSummary || `Version ${v.versionNumber}`}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                              <span>
                                By: {v.uploadedBy?.name || 'Author'} ({v.uploadedBy?.email || ''})
                              </span>
                              <span>•</span>
                              <span>
                                {v.encryptedSize
                                  ? `${(v.encryptedSize / 1024).toFixed(1)} KB`
                                  : '—'}
                              </span>
                              <span>•</span>
                              <span className="font-mono">
                                {new Date(v.createdAt).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Toolbar */}
                        <div className="flex items-center gap-2 shrink-0">
                          {!isCurrent && (file.isOwner || file.role === 'editor') && (
                            <button
                              type="button"
                              onClick={() => handleRestoreVersion(v.versionNumber)}
                              disabled={restoringVersion === v.versionNumber}
                              title="Restore this version as latest"
                              className="px-2.5 py-1 text-xs border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                            >
                              {restoringVersion === v.versionNumber ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3 text-[#1e40af]" />
                              )}
                              <span>Restore</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
