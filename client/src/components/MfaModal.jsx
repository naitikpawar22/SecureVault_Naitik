import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  ShieldCheck,
  Lock,
  Smartphone,
  Check,
  AlertCircle,
  Loader2,
  X,
  Copy,
  KeyRound,
  RefreshCw,
} from 'lucide-react';

/**
 * MFA Modal: Supports both Setup Mode (QR code + secret) and Verification Mode (6-digit code)
 */
export default function MfaModal({
  isOpen,
  onClose,
  mode = 'verify', // 'setup' | 'verify'
  onSuccess,
  title,
  description,
}) {
  const { user, setSessionAuth } = useAuth();
  const [currentMode, setCurrentMode] = useState(mode);
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError('');
      setSuccess('');
      setCurrentMode(mode);

      if (mode === 'setup' || !user?.mfaEnabled) {
        initSetup();
      }
    }
  }, [isOpen, mode, user]);

  const initSetup = async () => {
    setSettingUp(true);
    setError('');
    try {
      const res = await api.auth.setupMfa();
      setSecret(res.secret);
      setQrCode(res.qrCode);
      setCurrentMode('setup');
    } catch (err) {
      setError(err.message || 'Failed to initialize MFA setup.');
    } finally {
      setSettingUp(false);
    }
  };

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifySetup = async (e) => {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.auth.verifyMfaSetup({
        code: code.trim(),
        secret,
      });

      setSessionAuth(res.accessToken, res.user);
      setSuccess('MFA enabled and verified successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess(res);
        if (onClose) onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please check your authenticator app.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySession = async (e) => {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.auth.verifyMfa({
        code: code.trim(),
      });

      setSessionAuth(res.accessToken, res.user);
      setSuccess('MFA verified successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess(res);
        if (onClose) onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative z-10">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {title || (currentMode === 'setup' ? 'Set Up Two-Factor Authentication (MFA)' : 'MFA Verification Required')}
              </h3>
              <p className="text-[11px] text-slate-500">Authenticator App (TOTP)</p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {description && (
            <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
          )}

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

          {currentMode === 'setup' ? (
            /* Setup Flow */
            settingUp ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-7 h-7 text-[#1e40af] animate-spin" />
                <p className="text-xs text-slate-500 font-medium">Generating TOTP Secret & QR Code...</p>
              </div>
            ) : (
              <form onSubmit={handleVerifySetup} className="space-y-4">
                <div className="text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">1. Scan QR code in Authenticator App:</p>
                  <p className="text-[11px] text-slate-500">
                    Use Google Authenticator, Microsoft Authenticator, Authy, or any standard TOTP app.
                  </p>
                </div>

                {qrCode && (
                  <div className="flex justify-center p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <img src={qrCode} alt="TOTP QR Code" className="w-44 h-44 rounded-lg shadow-2xs" />
                  </div>
                )}

                {/* Secret Key Text for Manual Entry */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Or enter secret key manually:</label>
                  <div className="flex items-center gap-1.5 p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 break-all select-all">
                    <span className="flex-1 text-[11px] tracking-wider">{secret}</span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                      title="Copy Secret"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Verification Code Input */}
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-slate-800">
                    2. Enter the 6-digit code to verify:
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    className="w-full text-center tracking-[0.4em] font-mono text-lg py-2.5 px-3 border border-slate-300 rounded-xl focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1e40af] hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Verify and Enable MFA</span>
                </button>
              </form>
            )
          ) : (
            /* Verify Flow */
            <form onSubmit={handleVerifySession} className="space-y-4">
              <div className="text-xs text-slate-600">
                <p>Enter the 6-digit code from your authenticator app to complete verification.</p>
              </div>

              <div className="space-y-1">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full text-center tracking-[0.4em] font-mono text-xl py-3 px-3 border border-slate-300 rounded-xl focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1e40af] hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Verify Code</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
