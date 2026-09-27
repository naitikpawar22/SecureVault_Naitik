import React from 'react';
import { Star, FileText } from 'lucide-react';

export default function StarredView({ files = [], onRefresh }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Star className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Starred Files</h2>
            <p className="text-xs text-slate-500">
              Quick access to your most critical and frequently referenced encrypted vault documents.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-16 text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Star className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800">No starred files yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Star important files in your vault to find them easily in this section.
          </p>
        </div>
      </div>
    </div>
  );
}
