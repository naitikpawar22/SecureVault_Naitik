import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Link as LinkIcon,
  Copy,
  Check,
  Clock,
  ShieldAlert,
  Loader2,
  X,
  FileText,
  Folder,
  CheckCircle2,
  Info,
} from 'lucide-react';

export default function GenerateLinkModal({
  isOpen,
  onClose,
  initialItem = null, // { type: 'file'|'folder', id, name }
  onLinkCreated,
}) {
  const [targetType, setTargetType] = useState(initialItem?.type || 'file');
  const [selectedItemId, setSelectedItemId] = useState(initialItem?.id || '');
  const [availableFiles, setAvailableFiles] = useState([]);
  const [availableFolders, setAvailableFolders] = useState([]);
  const [role, setRole] = useState('viewer');
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiresHours, setExpiresHours] = useState('24');
  const [customDate, setCustomDate] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setGeneratedLink(null);
      setCopied(false);

      if (initialItem) {
        setTargetType(initialItem.type);
        setSelectedItemId(initialItem.id);
      } else {
        loadOwnerItems();
      }
    }
  }, [isOpen, initialItem]);

  const loadOwnerItems = async () => {
    setLoadingItems(true);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        api.files.list(),
        api.folders.list(),
      ]);
      setAvailableFiles(filesRes.files || []);
      setAvailableFolders(foldersRes.folders || []);
      if (targetType === 'file' && filesRes.files?.length > 0 && !selectedItemId) {
        setSelectedItemId(filesRes.files[0].id);
      } else if (targetType === 'folder' && foldersRes.folders?.length > 0 && !selectedItemId) {
        setSelectedItemId(foldersRes.folders[0].id);
      }
    } catch (err) {
      console.warn('Failed to load items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedItemId) {
      setError('Please select a file or folder.');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      let finalExpiresHours = null;
      if (expiresHours === 'custom' && customDate) {
        const diffMs = new Date(customDate).getTime() - Date.now();
        if (diffMs <= 0) {
          setError('Custom expiration date must be in the future.');
          setGenerating(false);
          return;
        }
        finalExpiresHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
      } else if (expiresHours && expiresHours !== 'never') {
        finalExpiresHours = Number(expiresHours);
      }

      let res;
      if (targetType === 'file') {
        res = await api.files.createShareLink(selectedItemId, {
          role,
          allowDownload,
          expiresHours: finalExpiresHours,
        });
      } else {
        res = await api.folders.createShareLink(selectedItemId, {
          role,
          allowDownload,
          expiresHours: finalExpiresHours,
        });
      }

      const token = res.shareLink.token;
      const fullUrl = `${window.location.origin}/#shared/${token}`;
      setGeneratedLink({
        token,
        url: fullUrl,
        role: res.shareLink.role,
        expiresAt: res.shareLink.expiresAt,
        allowDownload: res.shareLink.allowDownload,
      });

      if (onLinkCreated) onLinkCreated(res.shareLink);
    } catch (err) {
      setError(err.message || 'Failed to generate link.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedLink?.url) return;
    navigator.clipboard.writeText(generatedLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Generate Secure Share Link</h3>
              <p className="text-[11px] text-slate-500">Requires Recipient Login, MFA & Owner Approval</p>
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
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
            <Info className="w-4 h-4 text-[#1e40af] shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px] leading-relaxed">
              <p className="font-semibold text-blue-950">Zero-Trust Access Control Workflow:</p>
              <p className="text-slate-600">
                Possession of this link does not grant immediate file access. Recipients must sign in, verify MFA, and submit an access request. The file remains inaccessible until you approve their request.
              </p>
            </div>
          </div>

          {!generatedLink ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              {/* Type selector (File or Folder) if not preset */}
              {!initialItem && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetType('file');
                      if (availableFiles[0]) setSelectedItemId(availableFiles[0].id);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      targetType === 'file'
                        ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Share File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetType('folder');
                      if (availableFolders[0]) setSelectedItemId(availableFolders[0].id);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      targetType === 'folder'
                        ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Folder className="w-4 h-4" />
                    <span>Share Folder</span>
                  </button>
                </div>
              )}

              {/* Item selection */}
              {!initialItem ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select {targetType === 'file' ? 'File' : 'Folder'}:
                  </label>
                  {loadingItems ? (
                    <div className="py-2 text-xs text-slate-400 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading items...</span>
                    </div>
                  ) : (
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af]"
                    >
                      {targetType === 'file'
                        ? availableFiles.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.originalName}
                            </option>
                          ))
                        : availableFolders.map((fd) => (
                            <option key={fd.id} value={fd.id}>
                              {fd.name}
                            </option>
                          ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="p-2.5 bg-slate-100 rounded-xl flex items-center gap-2 text-xs font-medium text-slate-800">
                  {initialItem.type === 'file' ? <FileText className="w-4 h-4 text-blue-600" /> : <Folder className="w-4 h-4 text-amber-600" />}
                  <span>{initialItem.name}</span>
                </div>
              )}

              {/* Access Role & Permissions */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Allowed Role:</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af]"
                  >
                    <option value="viewer">View Only (Preview)</option>
                    <option value="editor">Edit & Update (Editor)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expiration:</label>
                  <select
                    value={expiresHours}
                    onChange={(e) => setExpiresHours(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:border-[#1e40af]"
                  >
                    <option value="1">1 Hour</option>
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="168">7 Days</option>
                    <option value="720">30 Days</option>
                    <option value="custom">Custom Date</option>
                    <option value="never">Never (Manual Revoke)</option>
                  </select>
                </div>
              </div>

              {/* Custom expiration input */}
              {expiresHours === 'custom' && (
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

              {/* Download allowed toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Allow File Downloads</p>
                  <p className="text-[11px] text-slate-500">When disabled, recipients can only preview in browser</p>
                </div>
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="w-4 h-4 text-[#1e40af] rounded-sm focus:ring-[#1e40af]"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={generating || !selectedItemId}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1e40af] hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                <span>Generate Unguessable Link</span>
              </button>
            </form>
          ) : (
            /* Result Generated Link View */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">Secure shareable link created successfully!</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Share Link:</label>
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink.url}
                    className="flex-1 text-xs text-slate-800 bg-transparent outline-hidden font-mono truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 py-1 px-3 bg-[#1e40af] hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p>• <strong>Role:</strong> {generatedLink.role === 'editor' ? 'Editor' : 'View Only'}</p>
                <p>• <strong>Downloads:</strong> {generatedLink.allowDownload ? 'Allowed' : 'Blocked (Preview only)'}</p>
                <p>• <strong>Expires:</strong> {generatedLink.expiresAt ? new Date(generatedLink.expiresAt).toLocaleString() : 'Never'}</p>
                <p>• <strong>Approval:</strong> Recipients will submit a request which you can approve in the <em>Access Requests</em> tab.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGeneratedLink(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Generate Another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
