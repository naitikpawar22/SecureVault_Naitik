import React, { useState, useRef, useEffect } from 'react';
import { Plus, FolderPlus, Upload, FolderUp } from 'lucide-react';

export default function NewMenuButton({
  onNewFolder,
  onFileUpload,
  onFolderUpload,
  className = '',
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

  // Keyboard shortcut support (Alt+C then F/U/I)
  useEffect(() => {
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
  }, [onNewFolder]);

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
        className="flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all duration-150 font-medium text-sm select-none group"
      >
        <Plus className="w-5 h-5 text-slate-700 group-hover:scale-110 transition-transform stroke-[2.5]" />
        <span className="font-semibold text-slate-900 tracking-tight">New</span>
      </button>

      {/* The Dropdown Menu matching user photo 2 */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* New folder */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (onNewFolder) onNewFolder();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 text-slate-700 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <FolderPlus className="w-4 h-4 text-slate-500 group-hover:text-slate-900" />
              <span className="font-medium text-slate-800">New folder</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Alt+C then F</span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          {/* File upload */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 text-slate-700 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <Upload className="w-4 h-4 text-slate-500 group-hover:text-slate-900" />
              <span className="font-medium text-slate-800">File upload</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Alt+C then U</span>
          </button>

          {/* Folder upload */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (folderInputRef.current) folderInputRef.current.click();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 text-slate-700 transition-colors text-left group"
          >
            <div className="flex items-center gap-3">
              <FolderUp className="w-4 h-4 text-slate-500 group-hover:text-slate-900" />
              <span className="font-medium text-slate-800">Folder upload</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Alt+C then I</span>
          </button>
        </div>
      )}
    </div>
  );
}
