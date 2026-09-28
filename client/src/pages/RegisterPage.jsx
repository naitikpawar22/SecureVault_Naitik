import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Shield,
  Lock,
  AlertCircle,
  Loader2,
  UserCheck,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
  ArrowRight,
  KeyRound,
} from 'lucide-react';

export default function RegisterPage({ onNavigateLogin }) {
  const { prepareRegistration, completeRegistration } = useAuth();
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa_setup'

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // MFA Setup State
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [registeredData, setRegisteredData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /**
   * Handle Step 1: Initial Registration & Browser Cryptographic Key Generation
   */
  const handleCredentialsSubmit = async (e) => {
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
      const regData = await prepareRegistration(name, email, password);
      setRegisteredData(regData);

      // Immediately fetch TOTP secret & QR Code for Google Authenticator
      setStatusMessage('Generating Google Authenticator TOTP QR code...');
      const mfaRes = await api.auth.setupMfa();
      setSecret(mfaRes.secret);
      setQrCode(mfaRes.qrCode);

      // Transition to Google Authenticator setup step
      setStep('mfa_setup');
      setStatusMessage('');
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed.');
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Copy the secret key to clipboard
   */
  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Handle Step 2: Verify TOTP Code from Google Authenticator
   */
  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = mfaCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Please enter the 6-digit code shown in Google Authenticator.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.auth.verifyMfaSetup({
        code: cleanCode,
        secret,
      });

      setSuccess('Google Authenticator successfully linked to your account!');

      // Complete login and transition into dashboard
      setTimeout(() => {
        completeRegistration(res.user, res.accessToken, registeredData.keyPair.privateKey);
      }, 900);
    } catch (err) {
      setError(err.message || 'Invalid 6-digit code. Please check Google Authenticator and try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Optional: Skip Google Authenticator setup (can be joined later in Profile settings)
   */
  const handleSkipMfa = () => {
    if (registeredData) {
      completeRegistration(
        registeredData.response.user,
        registeredData.response.accessToken,
        registeredData.keyPair.privateKey
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center p-3 bg-[#0f172a] text-white rounded-xl shadow-sm mb-4">
          {step === 'mfa_setup' ? (
            <Smartphone className="w-8 h-8 text-[#3b82f6]" />
          ) : (
            <Shield className="w-8 h-8 text-[#3b82f6]" />
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">
          {step === 'mfa_setup' ? 'Join Google Authenticator' : 'Create SecureVault Account'}
        </h1>
        <p className="mt-1 text-xs text-[#64748b]">
          {step === 'mfa_setup'
            ? 'Scan the QR code or paste the setup key in Google Authenticator'
            : 'A unique asymmetric ECDH keypair will be generated in your browser'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-[#e2e8f0] rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
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
                  className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
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
                  className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
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
                  className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
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
                  className="w-full text-xs px-3 py-2 border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                />
              </div>

              <div className="bg-[#f8fafc] border border-[#e2e8f0] p-3 rounded-xl text-[11px] text-[#475569] space-y-1">
                <div className="font-semibold text-[#0f172a] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Zero-Knowledge Security Model:
                </div>
                <p>
                  Your private key is encrypted client-side with your password before upload. The server and storage providers can never decrypt your files.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="truncate">{statusMessage || 'Setting Up Keys...'}</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Generate Keys & Continue</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Step 2: Google Authenticator TOTP Setup */
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-[#1e40af]">
                  <Smartphone className="w-4 h-4" />
                  <span>Google Authenticator Two-Factor Setup</span>
                </span>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Join Google Authenticator to receive 6-digit Time-Based One-Time Passwords (TOTP) every time you sign in.
                </p>
              </div>

              {/* QR Code Display */}
              {qrCode && (
                <div className="flex flex-col items-center justify-center p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <img
                    src={qrCode}
                    alt="Google Authenticator QR Code"
                    className="w-44 h-44 rounded-lg shadow-sm border border-slate-200 bg-white p-1"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">
                    Scan with Google Authenticator
                  </span>
                </div>
              )}

              {/* Secret Key for Manual Entry / Pasting */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                  <span>Or enter setup key manually in app:</span>
                </label>
                <div className="flex items-center gap-1.5 p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 select-all">
                  <span className="flex-1 text-[11px] tracking-wider break-all">{secret}</span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors shrink-0 flex items-center gap-1 text-[11px] font-sans font-medium"
                    title="Copy Secret Key"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Step instructions */}
              <div className="text-[11px] text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                <div className="font-semibold text-slate-800">Quick Instructions:</div>
                <ol className="list-decimal list-inside space-y-0.5 text-slate-600">
                  <li>Open <strong>Google Authenticator</strong> on your phone</li>
                  <li>Tap <strong>+</strong> and select <strong>Scan QR code</strong> (or Enter key)</li>
                  <li>Enter the generated 6-digit code below</li>
                </ol>
              </div>

              {/* OTP Code Input */}
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Enter 6-Digit Google Authenticator OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
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
                    <span>Verify OTP & Enter SecureVault</span>
                  </>
                )}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={handleSkipMfa}
                  className="text-xs text-slate-500 hover:text-slate-800 underline transition-colors"
                >
                  Skip for now (you can join anytime in Profile settings)
                </button>
              </div>
            </form>
          )}

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
