import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, AlertCircle, Loader2, KeyRound, UserCheck, X } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onSuccess, initialMode = 'login' }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'login') {
      if (!email || !password) {
        setError('Please provide your email and password.');
        return;
      }
      setLoading(true);
      try {
        await login(email, password);
        if (onSuccess) onSuccess();
        onClose();
      } catch (err) {
        setError(err.message || 'Login failed. Please verify your credentials.');
      } finally {
        setLoading(false);
      }
    } else {
      // Register
      if (!name || !email || !password || !confirmPassword) {
        setError('Please fill in all required fields.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setLoading(true);
      try {
        setStatusMessage('Generating ECDH P-256 keypair in your browser...');
        await new Promise((r) => setTimeout(r, 200));

        setStatusMessage('Deriving Master Key with PBKDF2 (SHA-256)...');
        await new Promise((r) => setTimeout(r, 200));

        setStatusMessage('Registering account with zero-knowledge keys...');
        await register(name, email, password);

        if (onSuccess) onSuccess();
        onClose();
      } catch (err) {
        setError(err.message || 'Registration failed.');
      } finally {
        setLoading(false);
        setStatusMessage('');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl border border-[#cbd5e1] max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-[#0f172a] text-[#3b82f6] rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0f172a]">
                {mode === 'login' ? 'Sign In to SecureVault' : 'Create SecureVault Account'}
              </h3>
              <p className="text-[11px] text-[#64748b]">
                Sign in to upload and encrypt your own files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748b] hover:text-[#0f172a] p-1.5 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`py-2.5 text-center transition-colors border-b-2 ${
              mode === 'login'
                ? 'border-[#1e40af] text-[#1e40af] bg-white'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`py-2.5 text-center transition-colors border-b-2 ${
              mode === 'register'
                ? 'border-[#1e40af] text-[#1e40af] bg-white'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-[#1e40af] text-xs rounded-lg flex items-center gap-2">
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              <span>{statusMessage}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:ring-1 focus:ring-[#1e40af]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@organization.com"
              className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:ring-1 focus:ring-[#1e40af]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:ring-1 focus:ring-[#1e40af]"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:ring-1 focus:ring-[#1e40af]"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Zero-Knowledge Authentication...</span>
                </>
              ) : mode === 'login' ? (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Sign In & Unlock Vault</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Create Account & Keypair</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
