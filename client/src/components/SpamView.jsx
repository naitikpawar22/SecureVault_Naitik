import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export default function SpamView() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Spam Protection</h2>
            <p className="text-xs text-slate-500">
              Unverified shares and suspected unauthorized cryptographic attempts are filtered here.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-16 text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800">Your vault is clean</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Zero spam or unauthorized shares detected. All file shares require valid ECDH P-256 cryptographic signatures.
          </p>
        </div>
      </div>
    </div>
  );
}
