import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, FileText, Share2, History, LogOut, User as UserIcon, KeyRound, ShieldCheck } from 'lucide-react';
import UnlockModal from './UnlockModal';

export default function Navbar({ activeTab, setActiveTab, unreadSharedCount = 0 }) {
  const { user, privateKey, logout } = useAuth();
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  return (
    <header className="bg-[#0f172a] text-white border-b border-[#334155]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3">
            <div className="bg-[#1e40af] p-2 rounded text-white flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight">SecureVault</span>
                <span className="bg-[#1e293b] text-[#93c5fd] text-xs font-semibold px-2 py-0.5 rounded border border-[#334155] flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-400" /> Zero-Knowledge E2EE
                </span>
              </div>
              <p className="text-xs text-slate-400">Enterprise Private File Sharing</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('files')}
              className={`px-3 py-2 text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'files'
                  ? 'bg-[#1e293b] text-white border-b-2 border-[#3b82f6]'
                  : 'text-slate-300 hover:text-white hover:bg-[#1e293b]'
              }`}
            >
              <FileText className="w-4 h-4" /> My Vault
            </button>

            <button
              onClick={() => setActiveTab('shared')}
              className={`px-3 py-2 text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'shared'
                  ? 'bg-[#1e293b] text-white border-b-2 border-[#3b82f6]'
                  : 'text-slate-300 hover:text-white hover:bg-[#1e293b]'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>Shared With Me</span>
              {unreadSharedCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 text-[10px] font-bold bg-red-600 text-white rounded-full leading-none">
                  {unreadSharedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-2 text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-[#1e293b] text-white border-b-2 border-[#3b82f6]'
                  : 'text-slate-300 hover:text-white hover:bg-[#1e293b]'
              }`}
            >
              <History className="w-4 h-4" /> Audit Trail
            </button>
          </nav>

          {/* User Profile & Key Status */}
          <div className="flex items-center space-x-3">
            {/* Cryptographic Key Status Indicator */}
            {privateKey ? (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Key Active</span>
              </span>
            ) : (
              <button
                onClick={() => setShowUnlockModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-600 transition-colors"
                title="Your ECDH private key is locked. Click to enter your password and unlock it."
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-300" />
                <span>Unlock Key</span>
              </button>
            )}

            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-medium text-slate-200">{user?.name}</span>
              <span className="text-xs text-slate-400 font-mono">{user?.email}</span>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="p-2 text-slate-300 hover:text-white hover:bg-[#1e293b] rounded transition-colors flex items-center gap-1 text-sm border border-[#334155]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Unlock Key Modal */}
        <UnlockModal
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
        />


        {/* Mobile Navigation Row */}
        <div className="flex md:hidden border-t border-[#334155] py-2 space-x-2">
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-1.5 text-xs font-medium rounded text-center ${
              activeTab === 'files' ? 'bg-[#1e293b] text-white' : 'text-slate-400'
            }`}
          >
            My Vault
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`flex-1 py-1.5 text-xs font-medium rounded text-center ${
              activeTab === 'shared' ? 'bg-[#1e293b] text-white' : 'text-slate-400'
            }`}
          >
            Shared
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 py-1.5 text-xs font-medium rounded text-center ${
              activeTab === 'audit' ? 'bg-[#1e293b] text-white' : 'text-slate-400'
            }`}
          >
            Audit
          </button>
        </div>
      </div>
    </header>
  );
}
