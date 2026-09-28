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
import NewFolderModal from './components/NewFolderModal';
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
  Home,
  Users,
  Clock,
  Lock,
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
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [currentFolderName, setCurrentFolderName] = useState(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [folderRefreshTrigger, setFolderRefreshTrigger] = useState(0);

  useEffect(() => {
    setCurrentFolderId(null);
    setCurrentFolderName(null);
  }, [activeTab]);

  const handleCreateFolder = async (folderName) => {
    try {
      const res = await api.folders.create({
        name: folderName,
        parentId: currentFolderId,
      });
      setShowNewFolderModal(false);
      if (res && res.folder && res.folder.id) {
        // Open the newly created folder immediately without error
        setCurrentFolderId(res.folder.id);
        setCurrentFolderName(res.folder.name);
      }
      setFolderRefreshTrigger((prev) => prev + 1);
      window.dispatchEvent(new CustomEvent('vault:refresh-view', { detail: { folderId: res?.folder?.id || currentFolderId } }));
    } catch (err) {
      alert(err.message || 'Failed to create folder');
      throw err;
    }
  };

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
          onNewFolder={() => {
            if (activeTab !== 'files') setActiveTab('files');
            setShowNewFolderModal(true);
          }}
          onFileUpload={(files) => {
            if (activeTab !== 'files') setActiveTab('files');
            uploadFiles(files, currentFolderId, () => setFolderRefreshTrigger((prev) => prev + 1));
          }}
          onFolderUpload={(files) => {
            if (activeTab !== 'files') setActiveTab('files');
            uploadFolder(files, currentFolderId, () => setFolderRefreshTrigger((prev) => prev + 1));
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
                if (activeTab !== 'files') setActiveTab('files');
                setShowNewFolderModal(true);
              }}
              onFileUpload={(files) => {
                setMobileSidebarOpen(false);
                if (activeTab !== 'files') setActiveTab('files');
                uploadFiles(files, currentFolderId, () => setFolderRefreshTrigger((prev) => prev + 1));
              }}
              onFolderUpload={(files) => {
                setMobileSidebarOpen(false);
                if (activeTab !== 'files') setActiveTab('files');
                uploadFolder(files, currentFolderId, () => setFolderRefreshTrigger((prev) => prev + 1));
              }}
            />
          </div>
        </div>
      )}


      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b-2 border-slate-300 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-xl min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 -ml-1 text-slate-800 hover:text-slate-950 md:hidden rounded-xl border border-slate-300 hover:bg-slate-100 transition-colors shrink-0"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Global Search Box */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500 stroke-[2.5]" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search files & folders in Vault..."
                className="w-full text-xs pl-9 pr-3 sm:pr-4 py-2.5 border-2 border-slate-300 rounded-xl bg-slate-50 focus:bg-white text-slate-900 font-bold placeholder:text-slate-500 focus:outline-hidden focus:border-[#1e40af] focus:ring-2 focus:ring-[#1e40af]/20 transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Right Header: Security Pill, MFA, Notifications, Unlock Key */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* E2EE Zero-Knowledge Trust Indicator (Desktop) */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-950 border-2 border-emerald-300 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
              <span>AES-256 E2EE Active</span>
            </div>

            {/* Join Google Authenticator Button (Only shown if NOT already added) */}
            {!user?.mfaEnabled && (
              <button
                type="button"
                onClick={() => setShowMfaModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-950 border-2 border-amber-400 hover:bg-amber-100 transition-colors shadow-2xs"
                title="Join Google Authenticator (TOTP 2FA)"
              >
                <Smartphone className="w-4 h-4 text-amber-800 shrink-0 stroke-[2.5]" />
                <span className="hidden sm:inline">Join Google Authenticator</span>
              </button>
            )}

            <NotificationsDropdown onNavigateTab={setActiveTab} />

            {!privateKey && (
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-950 border-2 border-amber-400 hover:bg-amber-100 transition-colors shadow-2xs"
                title="Unlock ECDH Private Key"
              >
                <KeyRound className="w-4 h-4 text-amber-800 shrink-0 stroke-[2.5]" />
                <span className="hidden sm:inline">Unlock Key</span>
              </button>
            )}
          </div>
        </header>


        {/* Workspace Views */}
        <main className="flex-1 p-3.5 sm:p-6 md:p-8 max-w-7xl w-full mx-auto pb-24 md:pb-8">
          {activeTab === 'files' ? (
            <DashboardPage
              activeTab="files"
              setActiveTab={setActiveTab}
              onUpdateTotalBytes={setTotalBytes}
              searchQuery={globalSearch}
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              currentFolderName={currentFolderName}
              setCurrentFolderName={setCurrentFolderName}
              folderRefreshTrigger={folderRefreshTrigger}
              onOpenNewFolder={() => setShowNewFolderModal(true)}
            />
          ) : activeTab === 'requests' ? (
            <AccessRequestsPage />
          ) : activeTab === 'shared' ? (
            <DashboardPage
              activeTab="shared"
              setActiveTab={setActiveTab}
              onUpdateTotalBytes={setTotalBytes}
              searchQuery={globalSearch}
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              currentFolderName={currentFolderName}
              setCurrentFolderName={setCurrentFolderName}
              folderRefreshTrigger={folderRefreshTrigger}
              onOpenNewFolder={() => setShowNewFolderModal(true)}
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
              searchQuery={globalSearch}
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              currentFolderName={currentFolderName}
              setCurrentFolderName={setCurrentFolderName}
              folderRefreshTrigger={folderRefreshTrigger}
              onOpenNewFolder={() => setShowNewFolderModal(true)}
            />
          )}
        </main>

        {/* Mobile Sticky Bottom Navigation Bar (Visible on phones < md) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-slate-300 py-2 px-2 flex items-center justify-around shadow-xl safe-bottom">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === 'files'
                ? 'text-[#1e40af] bg-blue-100/70 border border-blue-200'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5 stroke-[2.5]" />
            <span>Vault</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shared')}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === 'shared'
                ? 'text-[#1e40af] bg-blue-100/70 border border-blue-200'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5 stroke-[2.5]" />
            <span>Shared</span>
            {unreadSharedCount > 0 && (
              <span className="absolute top-0.5 right-1 min-w-[18px] h-4.5 px-1 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full leading-none shadow-xs">
                {unreadSharedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === 'requests'
                ? 'text-[#1e40af] bg-blue-100/70 border border-blue-200'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <KeyRound className="w-5 h-5 mb-0.5 stroke-[2.5]" />
            <span>Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="absolute top-0.5 right-1 min-w-[18px] h-4.5 px-1 flex items-center justify-center text-[10px] font-bold bg-amber-600 text-white rounded-full leading-none shadow-xs">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === 'audit'
                ? 'text-[#1e40af] bg-blue-100/70 border border-blue-200'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Clock className="w-5 h-5 mb-0.5 stroke-[2.5]" />
            <span>Activity</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-[11px] font-bold text-slate-700 hover:text-slate-950 transition-all"
          >
            <Menu className="w-5 h-5 mb-0.5 stroke-[2.5]" />
            <span>More</span>
          </button>
        </nav>


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

      {/* Global New Folder Modal */}
      <NewFolderModal
        isOpen={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        onCreate={handleCreateFolder}
        targetFolderName={currentFolderName}
      />

      {/* Floating Global Upload Progress Line & Corner Widget across all tabs */}
      <UploadCornerWidget uploads={activeUploads} onDismissAll={dismissAll} />
    </div>
  );
}
