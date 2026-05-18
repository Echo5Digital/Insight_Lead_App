'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const TIMEOUT_MS      = 15 * 60 * 1000; // 15 minutes of inactivity → auto-logout
const WARNING_MS      = 13 * 60 * 1000; // show warning at 13 min (2 min before)
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'] as const;

export function useSessionTimeout() {
  const { logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  const mainTimer    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const warnTimer    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (mainTimer.current)    clearTimeout(mainTimer.current);
    if (warnTimer.current)    clearTimeout(warnTimer.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startTimers = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);

    warnTimer.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(120);
      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, WARNING_MS);

    mainTimer.current = setTimeout(() => {
      setShowWarning(false);
      logout();
    }, TIMEOUT_MS);
  }, [clearAllTimers, logout]);

  const handleActivity = useCallback(() => {
    // Once the warning is showing, only the "Stay Logged In" button resets timers
    if (showWarning) return;
    startTimers();
  }, [showWarning, startTimers]);

  const stayLoggedIn = useCallback(() => {
    startTimers();
  }, [startTimers]);

  useEffect(() => {
    startTimers();
    ACTIVITY_EVENTS.forEach(ev =>
      document.addEventListener(ev, handleActivity, { passive: true })
    );
    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach(ev =>
        document.removeEventListener(ev, handleActivity)
      );
    };
  }, [startTimers, handleActivity, clearAllTimers]);

  return { showWarning, secondsLeft, stayLoggedIn, logout };
}
