import React, { useState, useRef, useEffect } from 'react';
import { Folder, MoreVertical, Edit2, Trash2, FolderOpen, Share2 } from 'lucide-react';

export default function FolderCard({
  folder,
  onOpen,
  onRename,
  onDelete,
  onShare,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setEditName(folder.name);
  }, [folder.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveRename = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editName.trim() || editName.trim() === folder.name) {
      setIsEditing(false);
      setEditName(folder.name);
      return;
    }
    setIsEditing(false);
    if (onRename) onRename(folder.id, editName.trim());
  };

  return (
    <div
      onClick={() => {
        if (!isEditing && onOpen) onOpen(folder);
      }}
      className="bg-white rounded-xl border border-slate-200 hover:border-[#1e40af] hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between cursor-pointer group relative select-none min-h-[140px]"
    >
      {/* Top Header: Folder Icon and 3-dots Menu */}
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-lg bg-blue-50 group-hover:bg-[#1e40af] flex items-center justify-center transition-colors">
          <Folder className="w-6 h-6 text-[#1e40af] group-hover:text-white transition-colors fill-blue-500/20 group-hover:fill-white/20" />
        </div>

        {/* 3-dots Menu */}
        <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (onOpen) onOpen(folder);
                }}
                className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Open</span>
              </button>
              {(folder.isOwner !== false || folder.role === 'editor') && onRename && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsEditing(true);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Rename</span>
                </button>
              )}
              {folder.isOwner !== false && onShare && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (onShare) onShare(folder);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Share</span>
                </button>
              )}
              {folder.isOwner !== false && onDelete && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      if (onDelete) onDelete(folder);
                    }}
                    className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Folder Name & Info */}
      <div className="mt-3">
        {isEditing ? (
          <form onSubmit={handleSaveRename} onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveRename}
              className="w-full text-xs font-semibold px-2 py-1 border border-[#1e40af] rounded bg-white text-slate-900 focus:outline-hidden"
            />
          </form>
        ) : (
          <h4
            className="text-xs font-semibold text-slate-900 truncate group-hover:text-[#1e40af] transition-colors"
            title={folder.name}
          >
            {folder.name}
          </h4>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
          <span>{folder.itemCount || 0} {folder.itemCount === 1 ? 'item' : 'items'}</span>
          {folder.isOwner === false && folder.owner && (
            <span
              className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium truncate max-w-[110px]"
              title={`Shared by ${folder.owner.name || folder.owner.email}`}
            >
              {folder.owner.name || folder.owner.email}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
