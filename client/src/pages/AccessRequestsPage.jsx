import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  unwrapFileKey,
  wrapFileKeyForRecipient,
} from '../utils/crypto';
import {
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  FileText,
  Folder,
  Eye,
  AlertCircle,
  Loader2,
  ChevronRight,
  Shield,
  UserX,
  Settings2,
  RotateCcw,
} from 'lucide-react';
import ApproveRequestModal from '../components/ApproveRequestModal';

export default function AccessRequestsPage() {
  const { privateKey } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending'); // 'pending' | 'approved' | 'rejected' | 'revoked' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    loadRequests();
  }, [filterStatus]);

  const loadRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.accessRequests.listOwner(filterStatus === 'all' ? '' : filterStatus);
      setRequests(res.requests || []);
    } catch (err) {
      setError(err.message || 'Failed to load access requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRequests();
  };

  // Helper to recursively collect all files in a folder
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

  // Inline role change (Viewer <-> Editor)
  const handleInlineRoleChange = async (request, newRole) => {
    // If changing role and privateKey is available, wrap keys to ensure editor has full decryption access
    if (newRole === 'editor' && !privateKey) {
      // Open modal so user can enter password to unlock privateKey
      setSelectedRequest({ ...request, grantedRole: newRole });
      return;
    }

    setUpdatingId(request.id);
    setError('');
    setSuccess('');

    try {
      let wrappedFileKey = null;
      let wrappedFileKeys = [];

      if (privateKey && request.requester?.publicKey) {
        if (request.targetType === 'file') {
          const fileId = request.file?._id || request.file?.id || request.targetId;
          try {
            const fileMeta = await api.files.get(fileId);
            const rawKey = fileMeta.file?.wrappedFileKey || fileMeta.file?.encryptedFileKey || request.file?.encryptedFileKey;
            if (rawKey) {
              const rawFek = await unwrapFileKey(rawKey, privateKey);
              wrappedFileKey = await wrapFileKeyForRecipient(rawFek, request.requester.publicKey);
            }
          } catch (wrapErr) {
            console.warn('Could not wrap key for single file:', wrapErr);
          }
        } else if (request.targetType === 'folder') {
          const folderId = request.folder?._id || request.folder?.id || request.targetId || request.folderId;
          const folderFiles = await collectFolderFiles(folderId);
          for (const f of folderFiles) {
            try {
              const fileMeta = await api.files.get(f.id);
              const rawKey = fileMeta.file?.wrappedFileKey || fileMeta.file?.encryptedFileKey || f.wrappedFileKey || f.encryptedFileKey;
              if (rawKey) {
                const rawFek = await unwrapFileKey(rawKey, privateKey);
                const recipientWrapped = await wrapFileKeyForRecipient(rawFek, request.requester.publicKey);
                wrappedFileKeys.push({
                  fileId: f.id,
                  wrappedFileKey: recipientWrapped,
                });
              }
            } catch (wrapErr) {
              console.warn(`Could not wrap key for file ${f.originalName}:`, wrapErr);
            }
          }
        }
      }

      await api.accessRequests.update(request.id, {
        role: newRole,
        wrappedFileKey,
        wrappedFileKeys,
      });

      setSuccess(`Permissions updated to ${newRole} for ${request.requester?.name || request.requester?.email}.`);
      loadRequests();
    } catch (err) {
      setError(err.message || 'Failed to update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Inline disable/revoke access
  const handleInlineRevoke = async (request) => {
    const confirmMsg = `Are you sure you want to disable access for ${request.requester?.name || request.requester?.email}?\n\nThey will immediately lose access and cannot see or open this ${request.targetType}.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setUpdatingId(request.id);
    setError('');
    setSuccess('');

    try {
      await api.accessRequests.revoke(request.id);
      setSuccess(`Access disabled for ${request.requester?.name || request.requester?.email}. Permissions revoked in database.`);
      loadRequests();
    } catch (err) {
      setError(err.message || 'Failed to disable access.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = r.requester?.name?.toLowerCase().includes(q);
    const emailMatch = r.requester?.email?.toLowerCase().includes(q);
    const itemMatch = r.itemName?.toLowerCase().includes(q);
    return nameMatch || emailMatch || itemMatch;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Pending</span>
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Approved</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Rejected</span>
          </span>
        );
      case 'revoked':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <UserX className="w-3 h-3 text-slate-600" />
            <span>Disabled / Revoked</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1e40af]" />
            <span>Access Requests</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review, approve, modify roles (Viewer &harr; Editor), or disable access for file and folder recipients.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80 w-fit flex-wrap">
          {[
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'revoked', label: 'Disabled / Revoked' },
            { id: 'rejected', label: 'Rejected' },
            { id: 'all', label: 'All Requests' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by requester or file..."
            className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af]"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-7 h-7 text-[#1e40af] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading access requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <KeyRound className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No access requests found</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              When link recipients submit access requests or when you manage active permissions, they will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Requester</th>
                  <th className="py-3 px-4">Requested Item</th>
                  <th className="py-3 px-4">Access Role</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Requester Name & Email */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#1e40af] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                          {r.requester?.name ? r.requester.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{r.requester?.name || 'Unknown'}</p>
                          <p className="text-[11px] text-slate-500 truncate">{r.requester?.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Requested File / Folder */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 max-w-xs truncate">
                        {r.targetType === 'file' ? (
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <span className="font-medium text-slate-800 truncate">{r.itemName}</span>
                      </div>
                    </td>

                    {/* Granted or Requested Role */}
                    <td className="py-3 px-4">
                      {r.status === 'approved' ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={r.grantedRole || 'viewer'}
                            onChange={(e) => handleInlineRoleChange(r, e.target.value)}
                            disabled={updatingId === r.id}
                            className="text-xs font-semibold py-1 px-2.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-[#1e40af] cursor-pointer text-slate-800"
                            title="Click to switch between Viewer and Editor"
                          >
                            <option value="viewer">Viewer (Preview)</option>
                            <option value="editor">Editor (Edit & Upload)</option>
                          </select>
                          {updatingId === r.id && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1e40af]" />
                          )}
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-700 capitalize">
                          {r.requestedRole === 'editor' ? 'Edit & Update' : 'View Only'}
                        </span>
                      )}
                    </td>

                    {/* Date and Time */}
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      <div>{new Date(r.requestDate).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(r.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      {getStatusBadge(r.status)}
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3 px-4 text-right">
                      {r.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(r)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#1e40af] hover:bg-blue-800 transition-colors shadow-2xs cursor-pointer"
                          >
                            <span>Review Request</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : r.status === 'approved' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleInlineRevoke(r)}
                            disabled={updatingId === r.id}
                            title="Disable this user's access"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Disable Access</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(r)}
                            title="Manage permissions, download settings, and expiration"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Manage</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#1e40af] hover:text-blue-800 border border-blue-200 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Re-Approve</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Approve / Manage Dialog */}
      <ApproveRequestModal
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        request={selectedRequest}
        onSuccess={loadRequests}
      />
    </div>
  );
}
