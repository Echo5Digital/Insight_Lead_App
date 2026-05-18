'use client';

import { useSessionTimeout } from '@/hooks/useSessionTimeout';

export default function SessionGuard() {
  const { showWarning, secondsLeft, stayLoggedIn, logout } = useSessionTimeout();

  if (!showWarning) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2L18 17H2L10 2Z" stroke="#D97706" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M10 8v4M10 14v.5"    stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Session Expiring Soon</h2>
        </div>

        <p className="text-slate-600 text-sm mb-2">
          Your session will end automatically due to inactivity.
        </p>
        <p className="text-slate-900 font-semibold text-center text-3xl tabular-nums mb-6">
          {minutes}:{seconds}
        </p>

        <div className="flex gap-3">
          <button
            onClick={logout}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Log Out Now
          </button>
          <button
            onClick={stayLoggedIn}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Stay Logged In
          </button>
        </div>

      </div>
    </div>
  );
}
