import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Shield, Lock, AlertCircle, Loader2, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';

export default function LoginPage({ onNavigateRegister }) {
  const { login, setSessionAuth } = useAuth();
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await login(email, password);
      if (res.mfaRequired && !res.mfaVerified) {
        setStep('mfa');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = mfaCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Please enter a valid 6-digit TOTP code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.auth.verifyMfa({ code: cleanCode });
      if (res.success && res.accessToken) {
        setSessionAuth(res.accessToken, res.user);
      }
    } catch (err) {
      setError(err.message || 'MFA verification failed. Please check your code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center p-3 bg-[#0f172a] text-white rounded-lg shadow-sm mb-4">
          <Shield className="w-8 h-8 text-[#3b82f6]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">
          {step === 'mfa' ? 'Two-Factor Authentication' : 'Sign in to SecureVault'}
        </h1>
        <p className="mt-1 text-xs text-[#64748b]">
          {step === 'mfa'
            ? 'Enter the 6-digit code from your authenticator app'
            : 'Zero-Knowledge End-to-End Encrypted File Sharing'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-[#e2e8f0] rounded-xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
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
                  className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
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
                  className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                />
                <p className="mt-1 text-[11px] text-[#64748b]">
                  Your password derives the local key that unlocks your private encryption key.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Decrypting Private Key & Authenticating...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                <span className="font-bold flex items-center gap-1.5 mb-1 text-[#1e40af]">
                  <Smartphone className="w-4 h-4" />
                  <span>Google Authenticator OTP Required</span>
                </span>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Enter the 6-digit Time-Based One-Time Password (TOTP) from your <strong>Google Authenticator</strong> app to log in.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center text-lg tracking-[0.4em] font-mono px-3 py-2.5 border border-[#cbd5e1] rounded-xl bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full py-2.5 px-4 bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying OTP...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify OTP & Sign In</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setError('');
                }}
                className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
              >
                Back to credentials
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-[#e2e8f0] text-center">
            <p className="text-xs text-[#64748b]">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onNavigateRegister}
                className="font-medium text-[#1e40af] hover:underline"
              >
                Create an account
              </button>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-[#94a3b8] flex items-center justify-center gap-1">
            <Lock className="w-3 h-3 text-emerald-600" /> AES-256-GCM and ECDH Cryptography
          </p>
        </div>
      </div>
    </div>
  );
}
