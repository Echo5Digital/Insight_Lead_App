'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, UserCheck, Stethoscope, Calendar,
  ClipboardList, BarChart2, TrendingUp, Settings, LogOut,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

interface Badges { leads?: number; tasks?: number }

const SECTIONS = [
  {
    label: 'MAIN',
    items: [
      { href: '/dashboard',       label: 'Overview',          icon: LayoutDashboard },
      { href: '/leads',           label: 'Leads',             icon: Users,           badge: 'leads' },
      { href: '/patients',        label: 'Patients',          icon: UserCheck },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { href: '/appointments',    label: 'Appointments',      icon: Calendar },
      { href: '/tasks',           label: 'Tasks',             icon: ClipboardList,   badge: 'tasks' },
      { href: '/pain-management', label: 'Pain Management',   icon: Stethoscope },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { href: '/referrals',       label: 'Referrals',         icon: BarChart2 },
      { href: '/process',         label: 'Process Metrics',   icon: TrendingUp },
    ],
  },
];

const ADMIN_SECTION = {
  label: 'ADMIN',
  items: [
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
};

export default function Sidebar() {
  const pathname         = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [badges,    setBadges]    = useState<Badges>({});

  useEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  // Load live badge counts
  useEffect(() => {
    async function loadBadges() {
      try {
        const [leadsRes, tasksRes] = await Promise.allSettled([
          api.get<{ total: number }>('/leads?limit=1&status=New'),
          api.get<{ missingIntake: unknown[]; missingTest: unknown[]; missingFeedback: unknown[] }>('/dashboard/tasks'),
        ]);
        setBadges({
          leads: leadsRes.status === 'fulfilled' ? leadsRes.value.total : undefined,
          tasks: tasksRes.status === 'fulfilled'
            ? (tasksRes.value.missingIntake?.length ?? 0) +
              (tasksRes.value.missingTest?.length ?? 0) +
              (tasksRes.value.missingFeedback?.length ?? 0)
            : undefined,
        });
      } catch {}
    }
    loadBadges();
    const id = setInterval(loadBadges, 60_000);
    return () => clearInterval(id);
  }, []);

  const toggle = () => setCollapsed(c => {
    localStorage.setItem('sidebar_collapsed', String(!c));
    return !c;
  });

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const NavItem = ({ href, label, icon: Icon, badge }: { href: string; label: string; icon: React.ElementType; badge?: string }) => {
    const count = badge ? badges[badge as keyof Badges] : undefined;
    return (
      <Link href={href} title={collapsed ? label : undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group relative',
          collapsed ? 'justify-center' : '',
          isActive(href)
            ? 'bg-brand text-white shadow-sm shadow-brand/30'
            : 'text-slate-400 hover:bg-white/10 hover:text-white'
        )}>
        <Icon size={17} strokeWidth={2} className="flex-shrink-0" />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && count != null && count > 0 && (
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none',
            badge === 'tasks' ? 'bg-amber-400 text-amber-900' : 'bg-red-500 text-white')}>
            {count > 99 ? '99+' : count}
          </span>
        )}
        {collapsed && count != null && count > 0 && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
        )}
        {collapsed && (
          <div className="absolute left-full ml-3 px-2 py-1 bg-navy-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg">
            {label}{count != null && count > 0 ? ` (${count})` : ''}
          </div>
        )}
      </Link>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    collapsed ? <div className="border-t border-white/10 my-2" /> : (
      <p className="text-[10px] font-semibold text-slate-600 tracking-widest px-3 pt-4 pb-1 uppercase">{label}</p>
    )
  );

  return (
    <aside className={cn(
      'flex flex-col bg-navy-900 text-slate-300 flex-shrink-0 transition-all duration-300 relative',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center justify-center border-b border-white/10 flex-shrink-0', collapsed ? 'px-2 h-14' : 'px-3 h-20')}>
        {!collapsed
          ? <div className="bg-white rounded-xl px-3 py-2 w-full flex items-center justify-center">
              <img
                src="/image.png"
                alt="Insightful Mind Psychological Services"
                className="h-12 w-auto object-contain"
              />
            </div>
          : <div className="bg-white rounded-lg p-1">
              <img
                src="/image.png"
                alt="Insightful Mind"
                className="h-8 w-8 object-contain object-left"
              />
            </div>
        }
      </div>

      {/* Collapse toggle */}
      <button onClick={toggle}
        className="absolute -right-3 top-16 w-6 h-6 bg-navy-800 border border-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-white z-10 transition-colors shadow-md">
        {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
        {SECTIONS.map(section => (
          <div key={section.label}>
            <SectionLabel label={section.label} />
            <div className="space-y-0.5">
              {section.items.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        ))}

        {user?.role === 'admin' && (
          <div>
            <SectionLabel label={ADMIN_SECTION.label} />
            <div className="space-y-0.5">
              {ADMIN_SECTION.items.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-2 flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl mb-1">
            <div className="w-8 h-8 rounded-full bg-brand/20 text-brand flex items-center justify-center text-sm font-bold flex-shrink-0">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.name || user?.email}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
          </div>
        )}
        <button onClick={logout} title={collapsed ? 'Sign out' : undefined}
          className={cn('flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-white/10 hover:text-white transition-colors', collapsed ? 'justify-center' : '')}>
          <LogOut size={15} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
