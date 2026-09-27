import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { History, Shield, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.audit.getMyLogs();
      setLogs(res.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve audit trail');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'upload':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'download':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'share':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'revoke':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'delete':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'login':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'register':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (actionFilter === 'all') return true;
    return log.action === actionFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e2e8f0]">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
            <History className="w-5 h-5 text-[#1e40af]" /> Security Audit Trail
          </h1>
          <p className="text-xs text-[#64748b] mt-1">
            Immutable log of all cryptographic, file management, and access events.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs border border-[#cbd5e1] rounded px-3 py-1.5 bg-white text-[#0f172a]"
          >
            <option value="all">All Events</option>
            <option value="upload">Upload</option>
            <option value="download">Download</option>
            <option value="share">Share</option>
            <option value="revoke">Revoke</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
          </select>

          <button
            onClick={loadLogs}
            disabled={loading}
            className="p-1.5 border border-[#cbd5e1] rounded bg-white hover:bg-[#f1f5f9] text-[#475569] text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-12 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-[#1e40af] animate-spin mx-auto" />
          <p className="text-xs text-[#64748b]">Loading immutable audit log records...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-12 text-center">
          <p className="text-xs text-[#64748b]">No audit logs found for the selected filter.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f8fafc] text-[#475569] font-medium border-b border-[#e2e8f0]">
              <tr>
                <th className="px-6 py-3">Event Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Resource / Details</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-6 py-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] bg-white">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-6 py-3 font-medium">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono uppercase border ${getActionBadge(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-[#0f172a]">
                    <div>{log.actor?.name || 'System User'}</div>
                    <div className="text-[10px] text-[#64748b]">{log.actor?.email}</div>
                  </td>

                  <td className="px-4 py-3 text-[#475569]">
                    {log.file ? (
                      <div className="font-medium text-[#0f172a] truncate max-w-xs">
                        {log.file.originalName}
                      </div>
                    ) : null}
                    {log.metadata?.recipientEmail && (
                      <div className="text-[10px] text-[#64748b]">
                        Recipient: {log.metadata.recipientEmail}
                      </div>
                    )}
                    {log.metadata?.revokedEmail && (
                      <div className="text-[10px] text-[#64748b]">
                        Revoked: {log.metadata.revokedEmail}
                      </div>
                    )}
                    {log.metadata?.size && (
                      <div className="text-[10px] text-[#64748b]">
                        Size: {(log.metadata.size / 1024).toFixed(1)} KB
                      </div>
                    )}
                    {!log.file &&
                      !log.metadata?.recipientEmail &&
                      !log.metadata?.revokedEmail &&
                      !log.metadata?.size && <span className="text-[#94a3b8]">—</span>}
                  </td>

                  <td className="px-4 py-3 text-[#64748b] font-mono text-[11px]">
                    {log.ipAddress || '127.0.0.1'}
                  </td>

                  <td className="px-6 py-3 text-right text-[#64748b] font-mono text-[11px] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
