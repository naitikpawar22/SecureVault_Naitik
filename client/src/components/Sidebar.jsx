import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  Home,
  Users,
  Clock,
  Star,
  ShieldAlert,
  Trash2,
  HardDrive,
  KeyRound,
  LogOut,
  User as UserIcon,
  ChevronRight,
  ShieldCheck,
  Lock,
  Edit2,
  Sparkles,
  Crown,
  Zap,
} from 'lucide-react';
import NewMenuButton from './NewMenuButton';
import ProfileModal from './ProfileModal';

export default function Sidebar({
  activeTab,
  setActiveTab,
  totalBytes = 0,
  unreadSharedCount = 0,
  onNewFolder,
  onFileUpload,
  onFolderUpload,
  onUnlockKey,
  onCloseMobile,
}) {
  const { user, logout, privateKey } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Storage calculation: out of 100 GB
  const maxStorageBytes = 100 * 1024 * 1024 * 1024; // 100 GB
  const usedMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const usedGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(3);
  const percentUsed = Math.min(Math.max((totalBytes / maxStorageBytes) * 100, 0.2), 100).toFixed(1);

  const navItems = [
    { id: 'files', label: 'Home', icon: Home },
    { id: 'shared', label: 'Shared with me', icon: Users },
    { id: 'audit', label: 'Recent Activity', icon: Clock },
    { id: 'starred', label: 'Starred', icon: Star },
    { id: 'spam', label: 'Spam', icon: ShieldAlert },
    { id: 'bin', label: 'Bin', icon: Trash2 },
  ];

  return (
    <aside className="w-64 bg-[#f8fafc] border-r border-slate-200/90 h-screen flex flex-col justify-between select-none shrink-0 sticky top-0">
      {/* Top Section */}
      <div className="p-4 space-y-4">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3 px-1">
          <div className="w-9 h-9 rounded-xl bg-[#1e40af] text-white flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-slate-900 tracking-tight">SecureVault</span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-600" /> Zero-Knowledge E2EE
            </p>
          </div>
        </div>

        {/* The + New Pill Button */}
        <div className="pt-1">
          <NewMenuButton
            onNewFolder={onNewFolder}
            onFileUpload={onFileUpload}
            onFolderUpload={onFolderUpload}
          />
        </div>

        {/* Navigation List */}
        <nav className="space-y-0.5 pt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-left ${
                  isActive
                    ? 'bg-blue-100/70 text-[#1e40af] font-bold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1e40af]' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
                {item.id === 'shared' && unreadSharedCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold bg-red-600 text-white rounded-full leading-none shadow-xs animate-in zoom-in-75 duration-150">
                    {unreadSharedCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="p-4 space-y-4 border-t border-slate-200/80 bg-white/50">
        {/* Key Status Pill */}
        <div>
          {privateKey ? (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Private Key Active</span>
              </span>
              <span className="text-[9px] font-mono bg-emerald-200/60 px-1 py-0.2 rounded text-emerald-900">
                ECDH
              </span>
            </div>
          ) : (
            <button
              onClick={onUnlockKey}
              type="button"
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-medium hover:bg-amber-100 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                <span>Unlock Private Key</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-700" />
            </button>
          )}
        </div>

        {/* Horizontal Storage Line Bar: "...GB of 100 GB used" */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span>Storage</span>
            </span>
            <span className="font-mono text-[10px] text-slate-500">100 GB Plan</span>
          </div>

          {/* Horizontal Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#1e40af] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${percentUsed}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>
              {totalBytes >= 1024 * 1024 * 1024 ? `${usedGB} GB` : `${usedMB} MB`} of 100 GB used
            </span>
            <span className="text-[10px]">{percentUsed}%</span>
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <div
            onClick={() => setShowProfileModal(true)}
            className="flex items-center space-x-2.5 truncate cursor-pointer hover:opacity-90 transition-all group/prof flex-1 p-1 -m-1 rounded-xl hover:bg-slate-100/70"
            title="Click to edit profile name and avatar"
          >
            {user?.avatar && user.avatar.startsWith('data:image') ? (
              <img
                src={user.avatar}
                alt={user?.name || 'Avatar'}
                className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs border border-slate-200"
              />
            ) : user?.avatar === 'preset:shield' ? (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Shield className="w-4 h-4" />
              </div>
            ) : user?.avatar === 'preset:lock' ? (
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Lock className="w-4 h-4" />
              </div>
            ) : user?.avatar === 'preset:key' ? (
              <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <KeyRound className="w-4 h-4" />
              </div>
            ) : user?.avatar === 'preset:star' ? (
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Star className="w-4 h-4" />
              </div>
            ) : user?.avatar === 'preset:sparkles' ? (
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
            ) : user?.avatar === 'preset:crown' ? (
              <div className="w-8 h-8 rounded-full bg-yellow-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Crown className="w-4 h-4" />
              </div>
            ) : user?.avatar === 'preset:zap' ? (
              <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}

            <div className="truncate flex-1">
              <div className="flex items-center gap-1">
                <h5 className="text-xs font-semibold text-slate-900 truncate group-hover/prof:text-[#1e40af] transition-colors">
                  {user?.name || 'User'}
                </h5>
                <Edit2 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/prof:opacity-100 transition-opacity shrink-0" />
              </div>
              <p className="text-[10px] text-slate-500 font-mono truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            type="button"
            title="Log Out & Switch User"
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Profile Edit Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </aside>
  );
}
