import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, AlertCircle, Loader2, UserCheck, ShieldCheck } from 'lucide-react';

export default function RegisterPage({ onNavigateLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    setError('');

    try {
      setStatusMessage('Generating ECDH P-256 cryptographic keypair in browser...');
      await new Promise((r) => setTimeout(r, 200));

      setStatusMessage('Deriving Master Key Encryption Key (PBKDF2 SHA-256)...');
      await new Promise((r) => setTimeout(r, 200));

      setStatusMessage('Registering account with zero-knowledge public key...');
      await register(name, email, password);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed.');
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center p-3 bg-[#0f172a] text-white rounded-lg shadow-sm mb-4">
          <Shield className="w-8 h-8 text-[#3b82f6]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">
          Create SecureVault Account
        </h1>
        <p className="mt-1 text-xs text-[#64748b]">
          A unique asymmetric ECDH keypair will be generated in your browser
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-[#e2e8f0] rounded-lg sm:px-10">
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@organization.com"
                className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Master Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">
                Confirm Master Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
              />
            </div>

            <div className="bg-[#f8fafc] border border-[#e2e8f0] p-3 rounded text-[11px] text-[#475569] space-y-1">
              <div className="font-semibold text-[#0f172a] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Zero-Knowledge Security Model:
              </div>
              <p>
                Your private key is encrypted with your password before being saved. The server and storage providers can never decrypt your files.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="truncate">{statusMessage || 'Setting Up Keys...'}</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Generate Keys & Register</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#e2e8f0] text-center">
            <p className="text-xs text-[#64748b]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onNavigateLogin}
                className="font-medium text-[#1e40af] hover:underline"
              >
                Sign in here
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
