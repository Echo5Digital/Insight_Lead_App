'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@/types';

interface AuthCtx {
  user:    User | null;
  setUser: (u: User | null) => void;
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('il_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    } else {
      // Try to fetch current user from backend
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.user) setUser(data.user); })
        .catch(() => {});
    }
  }, []);

  const updateUser = (u: User | null) => {
    setUser(u);
    if (u) sessionStorage.setItem('il_user', JSON.stringify(u));
    else   sessionStorage.removeItem('il_user');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    updateUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, setUser: updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
