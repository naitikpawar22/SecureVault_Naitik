import React from 'react';
import { Trash2, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function BinView({ files = [], onRefresh }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Bin</h2>
            <p className="text-xs text-slate-500">
              Items in the bin are retained according to your retention policy before cryptographic destruction.
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            type="button"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Bin"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Bin Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-16 text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Trash2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800">Your bin is empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Deleted files and folders will appear here. No items currently pending permanent cryptographic shredding.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>All active data securely encrypted with AES-256</span>
        </div>
      </div>
    </div>
  );
}
