'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { User } from '@/types';

// Auto-logout after 30 minutes of inactivity (HIPAA session control)
const INACTIVITY_MS   = 30 * 60 * 1000; // 30 min
const WARN_BEFORE_MS  =  1 * 60 * 1000; //  1 min warning

interface AuthCtx {
  user:    User | null;
  setUser: (u: User | null) => void;
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [warning, setWarning] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUser = useCallback((u: User | null) => {
    setUser(u);
    if (u) sessionStorage.setItem('il_user', JSON.stringify(u));
    else   sessionStorage.removeItem('il_user');
  }, []);

  const logout = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warnRef.current)  clearTimeout(warnRef.current);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    updateUser(null);
    setWarning(false);
    window.location.href = '/login';
  }, [updateUser]);

  // Reset inactivity timers on any user interaction
  const resetTimer = useCallback(() => {
    if (!sessionStorage.getItem('il_user')) return; // not logged in
    setWarning(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warnRef.current)  clearTimeout(warnRef.current);
    warnRef.current  = setTimeout(() => setWarning(true),  INACTIVITY_MS - WARN_BEFORE_MS);
    timerRef.current = setTimeout(() => logout(),           INACTIVITY_MS);
  }, [logout]);

  // Attach activity listeners
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // start the timer immediately
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current)  clearTimeout(warnRef.current);
    };
  }, [resetTimer]);

  // Restore user on page load
  useEffect(() => {
    const stored = sessionStorage.getItem('il_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    } else {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.user) setUser(data.user); })
        .catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser: updateUser, logout }}>
      {children}

      {/* ── Inactivity warning modal ── */}
      {warning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-4xl mb-3">⏱</div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Still there?</h2>
            <p className="text-sm text-slate-500 mb-6">
              You&apos;ll be logged out in 1 minute due to inactivity.<br />
              Move your mouse or press any key to stay signed in.
            </p>
            <button
              onClick={resetTimer}
              className="w-full bg-brand text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity">
              Stay Signed In
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
