import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, X, Loader2 } from 'lucide-react';

export default function NewFolderModal({
  isOpen,
  onClose,
  onCreate,
  targetFolderName = null,
}) {
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName('Untitled folder');
      setError('');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = folderName.trim();
    if (!name) {
      setError('Please provide a folder name.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onCreate(name);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create folder.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border-2 border-slate-300 max-w-sm w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1e40af] flex items-center justify-center border border-blue-200">
              <FolderPlus className="w-4 h-4 stroke-[2.5]" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Create New Folder</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-slate-500 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border-2 border-red-300 text-red-800 text-xs font-bold rounded-xl">
              {error}
            </div>
          )}

          {/* Location indicator */}
          <div className="flex items-center justify-between text-xs bg-slate-100/90 border border-slate-300 px-3 py-2 rounded-xl">
            <span className="font-semibold text-slate-600">Location:</span>
            <span className="font-bold text-slate-900 truncate max-w-[200px]" title={targetFolderName || 'Vault Root'}>
              {targetFolderName ? `📁 ${targetFolderName}` : '🏠 Vault (Root)'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Folder Name
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border-2 border-slate-300 rounded-xl bg-white text-slate-900 font-bold focus:outline-hidden focus:border-[#1e40af] focus:ring-2 focus:ring-[#1e40af]/20 shadow-2xs transition-all"
              placeholder="e.g. Marketing, Financials, Personal"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-[#1e40af] hover:bg-blue-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 border-2 border-blue-900"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Folder</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
