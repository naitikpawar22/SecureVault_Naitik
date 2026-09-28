import React, { useState, useRef, useEffect } from 'react';
import { Plus, FolderPlus, Upload, FolderUp } from 'lucide-react';

export default function NewMenuButton({
  onNewFolder,
  onFileUpload,
  onFolderUpload,
  className = '',
  enableShortcuts = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut support (Alt+C then F/U/I) - only active if enableShortcuts is true
  useEffect(() => {
    if (!enableShortcuts) return;

    let altCPressed = false;
    let timer = null;

    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        altCPressed = true;
        clearTimeout(timer);
        timer = setTimeout(() => {
          altCPressed = false;
        }, 1500);
        return;
      }

      if (altCPressed) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          altCPressed = false;
          setIsOpen(false);
          if (onNewFolder) onNewFolder();
        } else if (e.key === 'u' || e.key === 'U') {
          e.preventDefault();
          altCPressed = false;
          setIsOpen(false);
          if (fileInputRef.current) fileInputRef.current.click();
        } else if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          altCPressed = false;
          setIsOpen(false);
          if (folderInputRef.current) folderInputRef.current.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [enableShortcuts, onNewFolder]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onFileUpload) onFileUpload(e.target.files);
      e.target.value = '';
    }
    setIsOpen(false);
  };

  const handleFolderChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onFolderUpload) onFolderUpload(e.target.files);
      e.target.value = '';
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      {/* Hidden file & folder inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFolderChange}
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
      />

      {/* The + New Pill Button matching user photo */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-900 rounded-2xl border-2 border-slate-300 hover:border-[#1e40af] shadow-md hover:shadow-lg transition-all duration-150 font-bold text-sm select-none group"
      >
        <Plus className="w-5 h-5 text-slate-800 group-hover:scale-110 transition-transform stroke-[2.5]" />
        <span className="font-bold text-slate-900 tracking-tight">New</span>
      </button>

      {/* The Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-56 min-w-[220px] bg-white rounded-2xl shadow-2xl border-2 border-slate-300 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* New folder */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (onNewFolder) onNewFolder();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 text-slate-800 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <FolderPlus className="w-4 h-4 text-slate-600 group-hover:text-[#1e40af]" />
              <span className="font-bold text-slate-900">New folder</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono font-semibold">Alt+C then F</span>
          </button>

          <div className="my-1 border-t border-slate-200" />

          {/* File upload */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 text-slate-800 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <Upload className="w-4 h-4 text-slate-600 group-hover:text-[#1e40af]" />
              <span className="font-bold text-slate-900">File upload</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono font-semibold">Alt+C then U</span>
          </button>

          {/* Folder upload */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (folderInputRef.current) folderInputRef.current.click();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 text-slate-800 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <FolderUp className="w-4 h-4 text-slate-600 group-hover:text-[#1e40af]" />
              <span className="font-bold text-slate-900">Folder upload</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono font-semibold">Alt+C then I</span>
          </button>
        </div>
      )}

    </div>
  );
}
