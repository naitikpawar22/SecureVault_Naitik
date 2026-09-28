import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Lock, X, Loader2, AlertCircle, Check } from 'lucide-react';

export default function UnlockModal({ isOpen, onClose, onSuccess }) {
  const { unlockPrivateKey } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      await unlockPrivateKey(password);
      setPassword('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg border border-[#cbd5e1] max-w-md w-full shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-amber-100 text-amber-800 rounded">
              <KeyRound className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#0f172a]">Unlock Cryptographic Key</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748b] hover:text-[#0f172a] p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-[#475569] leading-relaxed">
            In accordance with zero-knowledge standards, your private ECDH encryption key is encrypted client-side using your password. Enter your password to activate your key for this session:
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Account Password
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded bg-white text-[#0f172a] focus:ring-1 focus:ring-[#1e40af] focus:border-[#1e40af]"
              required
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#475569] bg-white border border-[#cbd5e1] rounded hover:bg-[#f1f5f9]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="px-4 py-1.5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Decrypting Key...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Unlock Key</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
