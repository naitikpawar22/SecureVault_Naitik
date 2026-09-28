import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  X,
  User,
  Check,
  AlertCircle,
  Loader2,
  Camera,
  Upload,
  Shield,
  Lock,
  Key,
  Star,
  Sparkles,
  Smile,
  Crown,
  Zap,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import MfaModal from './MfaModal';

const PRESET_AVATARS = [
  { id: 'preset:shield', label: 'Shield', icon: Shield, bg: 'bg-blue-600' },
  { id: 'preset:lock', label: 'Vault', icon: Lock, bg: 'bg-emerald-600' },
  { id: 'preset:key', label: 'Security Key', icon: Key, bg: 'bg-amber-600' },
  { id: 'preset:star', label: 'Star', icon: Star, bg: 'bg-purple-600' },
  { id: 'preset:sparkles', label: 'Sparkles', icon: Sparkles, bg: 'bg-indigo-600' },
  { id: 'preset:crown', label: 'Crown', icon: Crown, bg: 'bg-yellow-600' },
  { id: 'preset:zap', label: 'Lightning', icon: Zap, bg: 'bg-rose-600' },
  { id: 'preset:user', label: 'User', icon: User, bg: 'bg-slate-800' },
];

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || '');
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && user) {
      setName(user.name || '');
      setSelectedAvatar(user.avatar || '');
      setError('');
      setSuccess('');
    }
  }, [isOpen, user]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 500 * 1024) {
      setError('Image is too large. Please select an image under 500 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedAvatar(reader.result);
      setError('');
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.users.updateProfile({
        name: name.trim(),
        avatar: selectedAvatar,
      });

      // Update in AuthContext & localStorage
      updateUser({
        name: res.user.name,
        avatar: res.user.avatar,
      });

      setSuccess('Profile updated successfully and saved to MongoDB!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Render current selected avatar preview
  const renderPreview = () => {
    if (selectedAvatar && selectedAvatar.startsWith('data:image')) {
      return (
        <img
          src={selectedAvatar}
          alt="Avatar Preview"
          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md mx-auto"
        />
      );
    }

    const matchedPreset = PRESET_AVATARS.find((p) => p.id === selectedAvatar);
    if (matchedPreset) {
      const IconComponent = matchedPreset.icon;
      return (
        <div className={`w-16 h-16 rounded-full ${matchedPreset.bg} text-white flex items-center justify-center border-2 border-white shadow-md mx-auto`}>
          <IconComponent className="w-8 h-8" />
        </div>
      );
    }

    // Default initial avatar
    return (
      <div className="w-16 h-16 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-2xl border-2 border-white shadow-md mx-auto">
        {name ? name.charAt(0).toUpperCase() : 'U'}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative z-10">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Edit Profile</h3>
              <p className="text-[11px] text-slate-500">Update your display name & profile icon</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Current Avatar Preview */}
          <div className="text-center py-2">
            <div className="relative inline-block">
              {renderPreview()}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-1.5 bg-[#1e40af] text-white rounded-full shadow-md hover:bg-blue-800 transition-colors"
                title="Upload Photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Display Name */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Name"
              required
              className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white text-slate-900 focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af] transition-all"
            />
          </div>

          {/* Email (Read only) */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-500">
              Email Address (Immutable)
            </label>
            <input
              type="text"
              value={user?.email || ''}
              readOnly
              className="w-full text-xs px-3.5 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 font-mono select-none cursor-not-allowed"
            />
          </div>

          {/* Google Authenticator Two-Factor Security Option */}
          {!user?.mfaEnabled ? (
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
                  <Smartphone className="w-4 h-4 text-amber-600" />
                  <span>Google Authenticator (TOTP)</span>
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full">
                  Not Added
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Add Google Authenticator to protect your vault with 6-digit verification codes every time you sign in.
              </p>
              <button
                type="button"
                onClick={() => setShowMfaModal(true)}
                className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Join Google Authenticator App</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Google Authenticator Active</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200/60 px-2 py-0.5 rounded-full">
                Protected
              </span>
            </div>
          )}

          {/* Preset Profile Icons */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-slate-700">
              Choose Profile Icon
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {PRESET_AVATARS.map((preset) => {
                const IconComponent = preset.icon;
                const isSelected = selectedAvatar === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedAvatar(preset.id)}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'border-[#1e40af] bg-blue-50/70 ring-2 ring-[#1e40af]/30 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full ${preset.bg} text-white flex items-center justify-center shadow-2xs`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-600">{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Photo Upload Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 border border-dashed border-slate-300 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Upload Custom Image</span>
              </button>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#1e40af] hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>

      {/* Google Authenticator Setup Modal */}
      <MfaModal
        isOpen={showMfaModal}
        onClose={() => setShowMfaModal(false)}
        mode="setup"
        title="Join Google Authenticator"
        description="Scan the QR code in Google Authenticator or enter the setup key manually, then enter the 6-digit verification code."
        onSuccess={(res) => {
          updateUser({ mfaEnabled: true, mfaVerified: true });
          setShowMfaModal(false);
        }}
      />
    </div>,
    document.body
  );
}
