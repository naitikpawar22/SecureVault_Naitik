import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './services/api';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import AuditPage from './pages/AuditPage';
import BinView from './components/BinView';
import SpamView from './components/SpamView';
import StarredView from './components/StarredView';
import UnlockModal from './components/UnlockModal';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PublicSharedView from './pages/PublicSharedView';
import AccessRequestsPage from './pages/AccessRequestsPage';
import NotificationsDropdown from './components/NotificationsDropdown';
import UploadCornerWidget from './components/UploadCornerWidget';
import MfaModal from './components/MfaModal';
import { useUpload } from './context/UploadContext';
import {
  Loader2,
  Menu,
  X,
  Search,
  Shield,
  KeyRound,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

export default function App() {
  const { isAuthenticated, loading, user, privateKey, updateUser } = useAuth();
  const { activeUploads, dismissAll, uploadFiles, uploadFolder } = useUpload();
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'requests' | 'shared' | 'audit' | 'starred' | 'spam' | 'bin'
  const [totalBytes, setTotalBytes] = useState(0);
  const [unreadSharedCount, setUnreadSharedCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Unread badge for "Shared with me"
  const checkUnreadShared = async () => {
    if (!isAuthenticated || !user) return;
    try {
      const [filesRes, foldersRes] = await Promise.all([
        api.files.list({ all: true }).catch(() => ({ sharedFiles: [] })),
        api.folders.list({ shared: true }).catch(() => ({ folders: [] })),
      ]);

      const sharedFiles = filesRes.sharedFiles || [];
      const sharedFolders = foldersRes.folders || [];

      // Collect all current shared IDs (files + folders)
      const allSharedItemIds = [
        ...sharedFiles.map((f) => `file_${f.id}`),
        ...sharedFolders.map((f) => `folder_${f.id}`),
      ];

      const storageKey = `securevault_visited_shared_${user._id || user.id}`;
      let visitedIds = [];
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) visitedIds = JSON.parse(stored);
      } catch (e) {
        visitedIds = [];
      }

      // If user is currently visiting the 'shared' tab, mark all current items as visited immediately
      if (activeTab === 'shared') {
        localStorage.setItem(storageKey, JSON.stringify(allSharedItemIds));
        setUnreadSharedCount(0);
        return;
      }

      const visitedSet = new Set(visitedIds);
      const unvisited = allSharedItemIds.filter((id) => !visitedSet.has(id));
      setUnreadSharedCount(unvisited.length);
    } catch (err) {
      console.warn('Failed to check unread shared items:', err);
    }
  };

  // Poll for pending access requests for the owner
  const checkPendingRequests = async () => {
    if (!isAuthenticated || !user) return;
    try {
      const res = await api.accessRequests.listOwner('pending');
      if (res.success) {
        setPendingRequestsCount(res.requests?.length || 0);
      }
    } catch (err) {
      // ignore polling errors
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      checkUnreadShared();
      checkPendingRequests();
      const interval = setInterval(() => {
        checkUnreadShared();
        checkPendingRequests();
      }, 7000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user, activeTab]);

  // Multi-format route parsing for shareable links:
  // Supports /#shared/:token, /#/shared/:token, /#shared-folder-:token, /#share/:token,
  // /share/:token (pathname), /shared/:token (pathname), and ?share=:token
  const parseSharedRoute = () => {
    const hash = window.location.hash || '';
    const pathname = window.location.pathname || '';
    const searchParams = new URLSearchParams(window.location.search || '');

    // 1. Pathname check: /share/:token or /shared/:token or /shared/link/:token
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'share' || pathParts[0] === 'shared') {
      let token = pathParts[1];
      if (token === 'link' && pathParts[2]) {
        token = pathParts[2];
      }
      if (token) {
        let key = searchParams.get('key');
        if (key && key.includes(' ') && !key.includes('+')) key = key.replace(/ /g, '+');
        return { token, key };
      }
    }

    // 2. Hash check
    if (hash) {
      let clean = hash.startsWith('#') ? hash.slice(1) : hash;
      if (clean.startsWith('/')) clean = clean.slice(1);

      if (clean.startsWith('shared-folder-')) {
        const parts = clean.replace('shared-folder-', '').split('?');
        const token = parts[0];
        const params = new URLSearchParams(parts[1] || '');
        let key = params.get('key') || searchParams.get('key');
        if (key && key.includes(' ') && !key.includes('+')) key = key.replace(/ /g, '+');
        return { token, key };
      }

      if (clean.startsWith('shared/') || clean.startsWith('share/')) {
        const parts = clean.replace(/^(shared|share)\//, '').split('?');
        const token = parts[0];
        const params = new URLSearchParams(parts[1] || '');
        let key = params.get('key') || searchParams.get('key');
        if (key && key.includes(' ') && !key.includes('+')) key = key.replace(/ /g, '+');
        return { token, key };
      }
    }

    // 3. Query string check: ?share=:token or ?token=:token
    const queryToken = searchParams.get('share') || searchParams.get('token') || searchParams.get('shared');
    if (queryToken) {
      let key = searchParams.get('key');
      if (key && key.includes(' ') && !key.includes('+')) key = key.replace(/ /g, '+');
      return { token: queryToken, key };
    }

    return null;
  };

  const [sharedRoute, setSharedRoute] = useState(() => parseSharedRoute());

  useEffect(() => {
    const handleRouteChange = () => {
      setSharedRoute(parseSharedRoute());
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // If viewing a public tokenized shareable link
  if (sharedRoute) {
    return (
      <PublicSharedView
        token={sharedRoute.token}
        keyParam={sharedRoute.key}
        onGoHome={() => {
          if (window.location.hash) window.location.hash = '';
          if (window.location.pathname !== '/') {
            window.history.pushState(null, '', '/');
          }
          setSharedRoute(null);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#1e40af] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Initializing SecureVault Security Context...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authView === 'register') {
      return <RegisterPage onNavigateLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onNavigateRegister={() => setAuthView('register')} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-row text-slate-900">
      {/* Desktop Left Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalBytes={totalBytes}
          unreadSharedCount={unreadSharedCount}
          pendingRequestsCount={pendingRequestsCount}
          onUnlockKey={() => setShowUnlockModal(true)}
          onNewFolder={() => window.dispatchEvent(new CustomEvent('vault:new-folder'))}
          onFileUpload={(files) => {
            setActiveTab('files');
            uploadFiles(files);
          }}
          onFolderUpload={(files) => {
            setActiveTab('files');
            uploadFolder(files);
          }}
        />
      </div>

      {/* Mobile Off-Canvas Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 flex flex-col h-full bg-[#f8fafc] w-64 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="p-3 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setMobileSidebarOpen(false);
              }}
              totalBytes={totalBytes}
              unreadSharedCount={unreadSharedCount}
              pendingRequestsCount={pendingRequestsCount}
              onUnlockKey={() => {
                setShowUnlockModal(true);
                setMobileSidebarOpen(false);
              }}
              onCloseMobile={() => setMobileSidebarOpen(false)}
              onNewFolder={() => {
                setMobileSidebarOpen(false);
                window.dispatchEvent(new CustomEvent('vault:new-folder'));
              }}
              onFileUpload={(files) => {
                setMobileSidebarOpen(false);
                setActiveTab('files');
                uploadFiles(files);
              }}
              onFolderUpload={(files) => {
                setMobileSidebarOpen(false);
                setActiveTab('files');
                uploadFolder(files);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:text-slate-900 md:hidden rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search Box */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search in Vault..."
                className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white text-slate-900 focus:outline-hidden focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af] transition-all"
              />
            </div>
          </div>

          {/* Right Header: Notifications and Cryptographic Key Status */}
          <div className="flex items-center space-x-2">
            {/* Join Google Authenticator Button (Only shown if NOT already added) */}
            {!user?.mfaEnabled && (
              <button
                type="button"
                onClick={() => setShowMfaModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors shadow-2xs"
                title="Join Google Authenticator 2FA"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-700" />
                <span className="hidden sm:inline">Join Google Authenticator</span>
              </button>
            )}

            <NotificationsDropdown onNavigateTab={setActiveTab} />

            {!privateKey && (
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors shadow-2xs"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                <span>Unlock Key</span>
              </button>
            )}
          </div>
        </header>

        {/* Workspace Views */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'files' ? (
            <DashboardPage
              activeTab="files"
              setActiveTab={setActiveTab}
              onUpdateTotalBytes={setTotalBytes}
            />
          ) : activeTab === 'requests' ? (
            <AccessRequestsPage />
          ) : activeTab === 'shared' ? (
            <DashboardPage
              activeTab="shared"
              setActiveTab={setActiveTab}
              onUpdateTotalBytes={setTotalBytes}
            />
          ) : activeTab === 'audit' ? (
            <AuditPage />
          ) : activeTab === 'starred' ? (
            <StarredView onRefresh={() => {}} />
          ) : activeTab === 'spam' ? (
            <SpamView />
          ) : activeTab === 'bin' ? (
            <BinView onRefresh={() => {}} />
          ) : (
            <DashboardPage
              activeTab="files"
              setActiveTab={setActiveTab}
              onUpdateTotalBytes={setTotalBytes}
            />
          )}
        </main>
      </div>

      {/* Global Unlock Modal */}
      <UnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        onSuccess={() => setShowUnlockModal(false)}
      />

      {/* Google Authenticator Setup Modal */}
      <MfaModal
        isOpen={showMfaModal}
        onClose={() => setShowMfaModal(false)}
        mode="setup"
        title="Join Google Authenticator"
        description="Scan the QR code in Google Authenticator or enter the setup key manually, then enter the 6-digit verification code."
        onSuccess={() => {
          updateUser({ mfaEnabled: true, mfaVerified: true });
          setShowMfaModal(false);
        }}
      />

      {/* Floating Global Upload Progress Line & Corner Widget across all tabs */}
      <UploadCornerWidget uploads={activeUploads} onDismissAll={dismissAll} />
    </div>
  );
}
