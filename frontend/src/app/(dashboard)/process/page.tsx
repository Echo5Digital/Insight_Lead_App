'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageSpinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ProcessData {
  last30: Metrics; last60: Metrics; ytd: Metrics;
  monthly: { _id: { year: number; month: number }; avgI2T: number; avgT2F: number; avgI2F: number; count: number }[];
}
interface Metrics { avgIntakeToTest: number|null; avgTestToFeedback: number|null; avgIntakeToFeedback: number|null; formsCompletionPct: number }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ProcessPage() {
  const [data,    setData]    = useState<ProcessData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ProcessData>('/dashboard/process')
      .then(setData).catch(() => toast.error('Failed to load process data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><PageSpinner /></div>;

  const fmt = (v: number | null, unit = 'd') => v != null ? `${v}${unit}` : '—';

  const chartData = (data?.monthly || []).slice(-12).map(m => ({
    month: `${MONTHS[m._id.month-1]} '${String(m._id.year).slice(2)}`,
    'Intake→Test':    m.avgI2T  ? Math.round(m.avgI2T)  : null,
    'Test→Feedback':  m.avgT2F  ? Math.round(m.avgT2F)  : null,
    'Intake→Feedback':m.avgI2F  ? Math.round(m.avgI2F)  : null,
    Count: m.count,
  }));

  const rows = [
    { label: 'Avg Intake → Test Days',     key: 'avgIntakeToTest',     unit: 'd', color: 'text-blue-600' },
    { label: 'Avg Test → Feedback Days',   key: 'avgTestToFeedback',   unit: 'd', color: 'text-amber-600' },
    { label: 'Avg Intake → Feedback Days', key: 'avgIntakeToFeedback', unit: 'd', color: 'text-purple-600' },
    { label: 'Forms Completion %',         key: 'formsCompletionPct',  unit: '%', color: 'text-emerald-600' },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="page-title">Process Metrics</h1>

      {/* 3-column comparison */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-4 border-b border-slate-100">
          <div className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Metric</div>
          {(['Last 30 Days', 'Last 60 Days', 'YTD'] as const).map(label => (
            <div key={label} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center border-l border-slate-100">{label}</div>
          ))}
        </div>
        {rows.map(({ label, key, unit, color }) => (
          <div key={key} className="grid grid-cols-4 border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <div className="px-5 py-3.5 text-sm font-medium text-slate-700">{label}</div>
            {(['last30','last60','ytd'] as const).map(period => (
              <div key={period} className={cn('px-5 py-3.5 text-center text-lg font-bold border-l border-slate-100', color)}>
                {fmt(data?.[period]?.[key as keyof Metrics] as number | null, unit)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Line chart */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="section-title mb-4">Cycle Time Trends</h3>
        {chartData.length === 0
          ? <p className="text-center text-slate-400 py-12">No data yet — add patients with completed appointments</p>
          : <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'days', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: unknown) => [`${v} days`]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Intake→Test"    stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Test→Feedback"  stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Intake→Feedback"stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
        }
      </div>
    </div>
  );
}
