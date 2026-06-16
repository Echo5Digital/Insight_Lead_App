'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageSpinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { Activity, Search, CalendarDays, X, ShieldAlert, LogIn } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  _id: string;
  entityType: 'auth' | 'patient' | 'lead';
  entityId: string;
  userId: string;
  userName: string;
  action: string;
  changedFields?: { field: string; oldValue?: unknown; newValue?: unknown }[];
  timestamp: string;
}

// ── Display maps ──────────────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, string> = {
  login_success:  'bg-emerald-100 text-emerald-700 border border-emerald-200',
  login_failed:   'bg-red-100 text-red-700 border border-red-200',
  created:        'bg-blue-100 text-blue-700 border border-blue-200',
  updated:        'bg-amber-100 text-amber-700 border border-amber-200',
  status_changed: 'bg-violet-100 text-violet-700 border border-violet-200',
  deleted:        'bg-red-100 text-red-700 border border-red-200',
  viewed:         'bg-slate-100 text-slate-500 border border-slate-200',
  converted:      'bg-cyan-100 text-cyan-700 border border-cyan-200',
  csv_exported:   'bg-orange-100 text-orange-700 border border-orange-200',
};

const ACTION_LABEL: Record<string, string> = {
  login_success:  'Login',
  login_failed:   'Failed Login',
  created:        'Created',
  updated:        'Updated',
  status_changed: 'Status Changed',
  deleted:        'Deleted',
  viewed:         'Viewed (PHI)',
  converted:      'Converted',
  csv_exported:   'CSV Exported',
};

const ENTITY_LABEL: Record<string, string> = {
  auth:    'Auth',
  patient: 'Patient',
  lead:    'Lead',
};

const ENTITY_STYLE: Record<string, string> = {
  auth:    'bg-slate-100 text-slate-600',
  patient: 'bg-blue-50 text-blue-700',
  lead:    'bg-purple-50 text-purple-700',
};

// ── Date preset helpers ────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisweek',  label: 'This Week' },
  { key: 'lastweek',  label: 'Last Week' },
  { key: 'thismonth', label: 'This Month' },
  { key: 'lastmonth', label: 'Last Month' },
  { key: 'last7',     label: 'Last 7d' },
  { key: 'last30',    label: 'Last 30d' },
  { key: 'last90',    label: 'Last 90d' },
];

function getDatePreset(key: string): { from: string; to: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (key === 'today')     { return { from: fmt(today), to: fmt(today) }; }
  if (key === 'yesterday') { const y = new Date(today); y.setDate(today.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
  if (key === 'thisweek')  {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (key === 'lastweek')  {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() - 6);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (key === 'thismonth') {
    return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
  }
  if (key === 'lastmonth') {
    return { from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  if (key === 'last7')  { const s = new Date(today); s.setDate(today.getDate() - 6);  return { from: fmt(s), to: fmt(today) }; }
  if (key === 'last30') { const s = new Date(today); s.setDate(today.getDate() - 29); return { from: fmt(s), to: fmt(today) }; }
  if (key === 'last90') { const s = new Date(today); s.setDate(today.getDate() - 89); return { from: fmt(s), to: fmt(today) }; }
  return { from: '', to: '' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function userInitial(name: string): string {
  return (name || '?').trim()[0].toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { user } = useAuth();

  const [logs,       setLogs]       = useState<AuditEntry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [pages,      setPages]      = useState(1);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [userSearch,  setUserSearch]  = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [datePreset,  setDatePreset]  = useState('');

  const hasFilters = !!(userSearch || actionFilter || typeFilter || dateFrom || dateTo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (userSearch)    params.set('userName',   userSearch.trim());
      if (actionFilter)  params.set('action',     actionFilter);
      if (typeFilter)    params.set('entityType', typeFilter);
      if (dateFrom)      params.set('dateFrom',   dateFrom);
      if (dateTo)        params.set('dateTo',     dateTo);
      const data = await api.get<{ logs: AuditEntry[]; total: number; pages: number }>(`/audit?${params}`);
      setLogs(data.logs); setTotal(data.total); setPages(data.pages);
    } catch { toast.error('Failed to load activity log'); }
    finally { setLoading(false); }
  }, [page, userSearch, actionFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (key: string) => {
    const { from, to } = getDatePreset(key);
    setDateFrom(from); setDateTo(to); setDatePreset(key); setPage(1);
  };

  const clearAll = () => {
    setUserSearch(''); setActionFilter(''); setTypeFilter('');
    setDateFrom(''); setDateTo(''); setDatePreset(''); setPage(1);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <ShieldAlert size={32} className="text-slate-300" />
        <p className="text-slate-500 text-sm">Admin access required to view the activity log.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Activity size={22} className="text-brand" />
            Activity Log
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All user actions — logins, edits, deletes, exports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <span className="text-xs bg-brand/10 text-brand px-2.5 py-1 rounded-full font-medium">
              {total} result{total !== 1 ? 's' : ''}
            </span>
          )}
          {hasFilters && (
            <button onClick={clearAll}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200">
              <X size={11} /> Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-4 space-y-3">
        {/* Row 1: search + dropdowns */}
        <div className="flex flex-wrap gap-3">
          {/* User search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input-base pl-8 text-sm w-full"
              placeholder="Search by user name or email…"
              value={userSearch}
              onChange={e => { setUserSearch(e.target.value); setPage(1); }}
            />
          </div>
          {/* Action type */}
          <select
            className="input-base w-44 text-sm"
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          >
            <option value="">All actions</option>
            <option value="login_success">Login</option>
            <option value="login_failed">Failed Login</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="status_changed">Status Changed</option>
            <option value="deleted">Deleted</option>
            <option value="viewed">Viewed (PHI)</option>
            <option value="converted">Converted</option>
            <option value="csv_exported">CSV Exported</option>
          </select>
          {/* Entity type */}
          <select
            className="input-base w-40 text-sm"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All types</option>
            <option value="auth">Login Events</option>
            <option value="patient">Patients</option>
            <option value="lead">Leads</option>
          </select>
        </div>

        {/* Row 2: date filter */}
        <div className={cn(
          'rounded-lg p-3 border transition-colors',
          (dateFrom || dateTo) ? 'border-brand/30 bg-brand/[0.02]' : 'border-slate-100 bg-slate-50'
        )}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays size={13} className={cn((dateFrom || dateTo) ? 'text-brand' : 'text-slate-400')} />
              <span className={cn('text-xs font-semibold', (dateFrom || dateTo) ? 'text-brand' : 'text-slate-500')}>
                Date Range
              </span>
            </div>
            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border font-medium transition-all',
                    datePreset === p.key
                      ? 'bg-brand text-white border-brand shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Custom inputs */}
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <span className="text-xs text-slate-400">From</span>
              <input type="date" className="input-base text-xs w-36"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setDatePreset(''); setPage(1); }} />
              <span className="text-xs text-slate-400">To</span>
              <input type="date" className="input-base text-xs w-36"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setDatePreset(''); setPage(1); }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setDatePreset(''); setPage(1); }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2.5 py-1 rounded-full border border-red-200 hover:bg-red-50 transition-colors font-medium">
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16"><PageSpinner /></div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <Activity size={28} className="mx-auto mb-2 text-slate-200" />
            No activity found{hasFilters ? ' for these filters' : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="table-th w-44">Time</th>
                  <th className="table-th">User</th>
                  <th className="table-th w-36">Action</th>
                  <th className="table-th w-28">Type</th>
                  <th className="table-th">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(log => (
                  <tr key={log._id} className={cn(
                    'hover:bg-slate-50 transition-colors',
                    log.action === 'login_failed' ? 'bg-red-50/40' : '',
                    log.action === 'deleted'      ? 'bg-red-50/20' : '',
                  )}>
                    {/* Timestamp */}
                    <td className="table-td">
                      <div className="text-xs text-slate-700 font-medium">{timeAgo(log.timestamp)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{fmtTimestamp(log.timestamp)}</div>
                    </td>

                    {/* User */}
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          log.entityType === 'auth' ? 'bg-slate-200 text-slate-600' : 'bg-brand/10 text-brand'
                        )}>
                          {log.entityType === 'auth'
                            ? <LogIn size={12} />
                            : userInitial(log.userName)
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate max-w-[160px]">
                            {log.userName || '—'}
                          </div>
                          {log.entityType === 'auth' && (
                            <div className="text-[10px] text-slate-400">Login attempt</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Action badge */}
                    <td className="table-td">
                      <span className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        ACTION_STYLE[log.action] || 'bg-slate-100 text-slate-600 border border-slate-200'
                      )}>
                        {ACTION_LABEL[log.action] || log.action}
                      </span>
                    </td>

                    {/* Entity type badge */}
                    <td className="table-td">
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full',
                        ENTITY_STYLE[log.entityType] || 'bg-slate-100 text-slate-500'
                      )}>
                        {ENTITY_LABEL[log.entityType] || log.entityType}
                      </span>
                    </td>

                    {/* Details */}
                    <td className="table-td">
                      {log.entityType === 'auth' ? (
                        <span className="text-xs text-slate-500">
                          {log.action === 'login_failed'
                            ? `Failed: ${log.changedFields?.find(f => f.field === 'reason')?.newValue ?? 'unknown'}`
                            : 'Session started'}
                        </span>
                      ) : log.entityType === 'patient' && log.entityId ? (
                        <Link href={`/patients/${log.entityId}`}
                          className="text-xs text-brand hover:underline font-medium">
                          View Patient →
                        </Link>
                      ) : log.entityType === 'lead' && log.entityId ? (
                        <Link href={`/leads`}
                          className="text-xs text-brand hover:underline font-medium">
                          View Lead →
                        </Link>
                      ) : null}
                      {/* Changed fields summary */}
                      {log.changedFields && log.changedFields.length > 0 && log.entityType !== 'auth' && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {log.changedFields.slice(0, 4).map((f, i) => (
                            <span key={i} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                              {f.field}
                            </span>
                          ))}
                          {log.changedFields.length > 4 && (
                            <span className="text-[10px] text-slate-400">+{log.changedFields.length - 4} more</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} limit={50} onChange={p => setPage(p)} />
      </div>
    </div>
  );
}
