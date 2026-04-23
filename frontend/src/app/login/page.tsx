'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginRequest } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/types';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router      = useRouter();
  const { setUser } = useAuth();

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginRequest(email, password);
      setUser(data.user as User);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)' }}>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center px-16 relative overflow-hidden">
        {/* Background circles */}
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #3B82F6, transparent)', transform: 'translate(-30%, -30%)' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #06B6D4, transparent)', transform: 'translate(30%, 30%)' }} />

        <div className="relative z-10 text-center">
          {/* Logo */}
          <div className="bg-white rounded-2xl px-8 py-5 inline-block mb-10 shadow-2xl">
            <img src="/image.png" alt="Insightful Mind Psychological Services" className="h-14 w-auto object-contain" />
          </div>

          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Patient Tracking<br />
            <span style={{ color: '#3B82F6' }}>Dashboard</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-sm mx-auto leading-relaxed">
            Manage your full patient pipeline — from referral to feedback — all in one place.
          </p>

          {/* Feature list */}
          <div className="mt-10 space-y-3 text-left max-w-xs mx-auto">
            {[
              '1,100+ patient records',
              'Real-time appointment tracking',
              'Automated cycle-time analytics',
              'Role-based staff access',
            ].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#3B82F6' }}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-slate-300 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-white rounded-2xl px-6 py-4 shadow-xl">
              <img src="/image.png" alt="Insightful Mind" className="h-10 w-auto object-contain" />
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Welcome back.</h2>
            <p className="text-slate-400">Sign in to your account to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@clinic.com"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3B82F6'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3B82F6'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-red-300"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <circle cx="8" cy="8" r="7" stroke="#EF4444" strokeWidth="1.5"/>
                  <path d="M8 5v3M8 10.5v.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: loading ? '#2563EB' : '#3B82F6' }}
              onMouseEnter={e => !loading && ((e.target as HTMLElement).style.background = '#2563EB')}
              onMouseLeave={e => !loading && ((e.target as HTMLElement).style.background = '#3B82F6')}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-8">
            Insightful Mind Psychological Services · Patient Dashboard v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
