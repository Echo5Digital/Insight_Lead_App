'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate, fmtDateShort } from '@/lib/utils';
import { PageSpinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { RefreshCw, Download } from 'lucide-react';
import type { Patient, Settings } from '@/types';

interface ApptData {
  intake: Patient[]; test: Patient[]; feedback: Patient[]; gfe: Patient[];
  config: { intake: number; test: number; feedback: number; gfeLookback: number };
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getPreset(key: string): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (key === 'today') {
    return { from: fmt(today), to: fmt(today) };
  }
  if (key === 'thisweek') {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (key === 'nextweek') {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 8);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (key === 'next14') {
    const end = new Date(today); end.setDate(today.getDate() + 13);
    return { from: fmt(today), to: fmt(end) };
  }
  if (key === 'next30') {
    const end = new Date(today); end.setDate(today.getDate() + 29);
    return { from: fmt(today), to: fmt(end) };
  }
  return { from: '', to: '' };
}

const PRESETS = [
  { key: 'today',    label: 'Today' },
  { key: 'thisweek', label: 'This Week' },
  { key: 'nextweek', label: 'Next Week' },
  { key: 'next14',   label: 'Next 14d' },
  { key: 'next30',   label: 'Next 30d' },
];

export default function AppointmentsPage() {
  const [data,      setData]      = useState<ApptData | null>(null);
  const [settings,  setSettings]  = useState<Settings | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [preset,    setPreset]    = useState('nextweek');
  const [dateFrom,  setDateFrom]  = useState(() => getPreset('nextweek').from);
  const [dateTo,    setDateTo]    = useState(() => getPreset('nextweek').to);
  const [insurance, setInsurance] = useState('');
  const [category,  setCategory]  = useState('');

  const load = async (overrides?: { dateFrom?: string; dateTo?: string; insurance?: string; category?: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const df  = overrides?.dateFrom  ?? dateFrom;
      const dt  = overrides?.dateTo    ?? dateTo;
      const ins = overrides?.insurance ?? insurance;
      const cat = overrides?.category  ?? category;
      if (df)  params.set('dateFrom',  df);
      if (dt)  params.set('dateTo',    dt);
      if (ins) params.set('insurance', ins);
      if (cat) params.set('category',  cat);
      const qs = params.toString();
      setData(await api.get<ApptData>(`/dashboard/appointments${qs ? '?' + qs : ''}`));
    } catch { toast.error('Failed to load appointments'); }
    finally { setLoading(false); }
  };

  const applyPreset = (key: string) => {
    const { from, to } = getPreset(key);
    setPreset(key);
    setDateFrom(from);
    setDateTo(to);
    load({ dateFrom: from, dateTo: to, insurance, category });
  };

  const applyFilters = () => load();

  useEffect(() => {
    api.get<Settings>('/settings').then(setSettings).catch(() => {});
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCount = data
    ? data.intake.length + data.test.length + data.feedback.length + data.gfe.length
    : 0;

  const handleExportCsv = () => {
    if (!data) return;
    const rows: string[][] = [['Type', 'Name', 'Insurance', 'DOB', 'Date']];
    const addRows = (type: string, pts: Patient[], field: keyof Patient) =>
      pts.forEach(p => rows.push([type, p.name || '', p.insurance || '', p.dob || '', String(p[field] || '')]));
    addRows('Intake',   data.intake,   'intakeAppt');
    addRows('Test',     data.test,     'testAppt');
    addRows('Feedback', data.feedback, 'feedbackAppt');
    addRows('GFE Sent', data.gfe,      'gfeSent');
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `appointments-${dateFrom || 'all'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Appointments</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5">{totalCount} appointments shown</p>}
        </div>
        <div className="flex gap-2">
          {data && (
            <button onClick={handleExportCsv} className="btn-secondary flex items-center gap-2 text-sm">
              <Download size={13} /> Export CSV
            </button>
          )}
          <button onClick={() => load()} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-slate-100">
        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                preset === p.key
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date + dropdowns */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-2">
            <input type="date" className="input-base text-sm w-36" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPreset(''); }} />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" className="input-base text-sm w-36" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPreset(''); }} />
          </div>
          <select className="input-base w-40 text-sm" value={insurance}
            onChange={e => setInsurance(e.target.value)}>
            <option value="">All insurance</option>
            {(settings?.insuranceList || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input-base w-40 text-sm" value={category}
            onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="Standard">Standard</option>
            <option value="Pain Management">Pain Management</option>
          </select>
          <button onClick={applyFilters} className="btn-primary text-sm px-4 py-2">Apply</button>
        </div>
      </div>

      {loading
        ? <div className="p-6"><PageSpinner /></div>
        : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            <ApptPanel title="Intake Appointments"   days={data?.config.intake ?? 7}        patients={data?.intake   ?? []} field="intakeAppt" />
            <ApptPanel title="Test Appointments"     days={data?.config.test ?? 7}          patients={data?.test     ?? []} field="testAppt" />
            <ApptPanel title="Feedback Appointments" days={data?.config.feedback ?? 7}      patients={data?.feedback ?? []} field="feedbackAppt" />
            <ApptPanel title="GFE Sent"              days={data?.config.gfeLookback ?? 100} patients={data?.gfe      ?? []} field="gfeSent" lookback />
          </div>
        )
      }
    </div>
  );
}

function ApptPanel({ title, days, patients, field, lookback }: {
  title: string; days: number; patients: Patient[]; field: keyof Patient; lookback?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
          {lookback ? `Last ${days}d` : `Next ${days}d`}
        </span>
      </div>
      <div className="p-2">
        {patients.length === 0
          ? <p className="text-xs text-slate-400 text-center py-6">No appointments</p>
          : patients.map(p => (
              <Link key={p._id} href={`/patients/${p._id}`}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                <div className="min-w-0 flex-1 mr-2">
                  {p.name
                    ? <p className="text-sm font-medium text-slate-700 group-hover:text-brand truncate">{p.name}</p>
                    : <p className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-block">⚠ Add name</p>
                  }
                  <p className="text-xs text-slate-400 mt-0.5">
                    {p.insurance || ''}{p.dob ? ` · DOB ${fmtDateShort(p.dob)}` : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap flex-shrink-0">
                  {fmtDate(p[field] as string)}
                </span>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
