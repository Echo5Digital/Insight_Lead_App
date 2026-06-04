'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { ArrowRight, RefreshCw, CalendarDays, X } from 'lucide-react';
import type { Patient } from '@/types';

interface TaskData {
  missingIntake: Patient[];
  missingTest: Patient[];
  missingFeedback: Patient[];
}

// ── Date filter helpers ────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisweek',  label: 'This Week' },
  { key: 'lastweek',  label: 'Last Week' },
  { key: 'thismonth', label: 'This Month' },
  { key: 'lastmonth', label: 'Last Month' },
  { key: 'last30',    label: 'Last 30d' },
  { key: 'last60',    label: 'Last 60d' },
  { key: 'last90',    label: 'Last 90d' },
];

function getDatePreset(key: string): { from: string; to: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (key === 'today')     { return { from: fmt(today), to: fmt(today) }; }
  if (key === 'yesterday') { const y = new Date(today); y.setDate(today.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
  if (key === 'thisweek')  {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (key === 'lastweek')  {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() - 6);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (key === 'thismonth') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: fmt(s), to: fmt(e) };
  }
  if (key === 'lastmonth') {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const e = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: fmt(s), to: fmt(e) };
  }
  if (key === 'last30') { const s = new Date(today); s.setDate(today.getDate() - 29); return { from: fmt(s), to: fmt(today) }; }
  if (key === 'last60') { const s = new Date(today); s.setDate(today.getDate() - 59); return { from: fmt(s), to: fmt(today) }; }
  if (key === 'last90') { const s = new Date(today); s.setDate(today.getDate() - 89); return { from: fmt(s), to: fmt(today) }; }
  return { from: '', to: '' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [data,       setData]       = useState<TaskData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [datePreset, setDatePreset] = useState('');

  const hasDateFilter = !!(dateFrom || dateTo);

  const load = useCallback(async (from = dateFrom, to = dateTo) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('dateFrom', from);
      if (to)   params.set('dateTo',   to);
      const qs = params.toString();
      setData(await api.get<TaskData>(`/dashboard/tasks${qs ? '?' + qs : ''}`));
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (key: string) => {
    const { from, to } = getDatePreset(key);
    setDateFrom(from); setDateTo(to); setDatePreset(key);
    load(from, to);
  };

  const clearDateFilter = () => {
    setDateFrom(''); setDateTo(''); setDatePreset('');
    load('', '');
  };

  const totalTasks = (data?.missingIntake?.length ?? 0) + (data?.missingTest?.length ?? 0) + (data?.missingFeedback?.length ?? 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">Outstanding Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalTasks} task{totalTasks !== 1 ? 's' : ''} need attention
            {hasDateFilter && <span className="text-brand font-medium"> (filtered)</span>}
          </p>
        </div>
        <button onClick={() => load()} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Advanced Date Filter */}
      <div className={cn(
        'bg-white rounded-xl p-4 mb-5 shadow-sm border transition-colors',
        hasDateFilter ? 'border-brand/30 bg-brand/[0.02]' : 'border-slate-100'
      )}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Header */}
          <div className="flex items-center gap-1.5">
            <CalendarDays size={14} className={cn(hasDateFilter ? 'text-brand' : 'text-slate-400')} />
            <span className={cn('text-xs font-semibold', hasDateFilter ? 'text-brand' : 'text-slate-500')}>
              Date Filter
            </span>
          </div>

          {/* Explanation */}
          <span className="text-xs text-slate-400 hidden sm:block">
            Filters each panel by its trigger date (Forms Sent / Intake Appt / Test Appt)
          </span>

          {/* Preset buttons */}
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

          {/* Custom range inputs */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-slate-400 font-medium">From</span>
            <input
              type="date"
              className="input-base text-xs w-36"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setDatePreset(''); }}
            />
            <span className="text-xs text-slate-400 font-medium">To</span>
            <input
              type="date"
              className="input-base text-xs w-36"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setDatePreset(''); }}
            />
            <button
              onClick={() => load()}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Apply
            </button>
            {hasDateFilter && (
              <button
                onClick={clearDateFilter}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2.5 py-1 rounded-full border border-red-200 hover:bg-red-50 transition-colors"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Active filter summary */}
        {hasDateFilter && (
          <div className="mt-3 pt-3 border-t border-brand/10 flex items-center gap-2">
            <span className="text-xs text-slate-400">Showing tasks where trigger date is:</span>
            <span className="text-xs bg-brand/10 text-brand px-2.5 py-0.5 rounded-full font-medium">
              {dateFrom && dateTo && dateFrom === dateTo && fmtDate(dateFrom)}
              {dateFrom && (!dateTo || dateTo !== dateFrom) && `from ${fmtDate(dateFrom)}`}
              {dateTo   && (!dateFrom || dateTo !== dateFrom) && ` to ${fmtDate(dateTo)}`}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12"><PageSpinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <TaskPanel
            title="Missing Intake Appointment"
            subtitle="Forms sent but no intake scheduled"
            patients={data?.missingIntake ?? []}
            dateLabel="Forms Sent"
            dateField="formsSent"
            color="blue"
          />
          <TaskPanel
            title="Missing Test Appointment"
            subtitle="Intake done but no test scheduled"
            patients={data?.missingTest ?? []}
            dateLabel="Intake Appt"
            dateField="intakeAppt"
            color="amber"
          />
          <TaskPanel
            title="Missing Feedback Appointment"
            subtitle="Test done but no feedback scheduled"
            patients={data?.missingFeedback ?? []}
            dateLabel="Test Appt"
            dateField="testAppt"
            color="purple"
          />
        </div>
      )}
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-500',
  amber:  'bg-amber-500',
  purple: 'bg-purple-500',
};

function TaskPanel({ title, subtitle, patients, dateLabel, dateField, color }: {
  title: string; subtitle: string; patients: Patient[];
  dateLabel: string; dateField: keyof Patient; color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-0.5">
          <div className={`w-2 h-2 rounded-full ${COLOR_MAP[color] || 'bg-slate-400'}`} />
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{patients.length}</span>
        </div>
        <p className="text-xs text-slate-400 pl-4">{subtitle}</p>
      </div>
      <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
        {patients.length === 0
          ? <p className="text-xs text-slate-400 text-center py-8">All caught up!</p>
          : patients.map(p => (
              <div key={p._id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={p.status || ''} />
                    <span className="text-xs text-slate-400">{dateLabel}: {fmtDate(p[dateField] as string)}</span>
                  </div>
                </div>
                <Link href={`/patients/${p._id}`}
                  className="flex items-center gap-1 text-xs text-brand font-medium hover:underline whitespace-nowrap flex-shrink-0">
                  Take Action <ArrowRight size={12} />
                </Link>
              </div>
            ))
        }
      </div>
    </div>
  );
}
