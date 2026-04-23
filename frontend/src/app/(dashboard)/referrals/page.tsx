'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageSpinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from 'recharts';

interface ReferralRow { _id: { source: string; year: number; month: number }; count: number }
interface ReferralData { patients: ReferralRow[] }

const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EXCLUDED   = new Set(['Grand Total', '(blank)', '', null, undefined]);
const BAR_COLORS = [
  '#3B82F6','#06B6D4','#10B981','#84CC16','#A855F7',
  '#F59E0B','#EF4444','#F97316','#EC4899','#6366F1',
];

type FilterMode = 'all' | 'year' | 'last90';

export default function ReferralsPage() {
  const [data,    setData]    = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FilterMode>('all');
  const [selYear, setSelYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    api.get<ReferralData>('/dashboard/referrals')
      .then(d => {
        setData(d);
        // Default selected year = most recent year in data
        const years = d.patients
          .map(r => r._id.year)
          .filter(Boolean);
        if (years.length) setSelYear(Math.max(...years));
      })
      .catch(() => toast.error('Failed to load referrals'))
      .finally(() => setLoading(false));
  }, []);

  // All valid rows (no Grand Total / blank)
  const cleanRows = useMemo(() =>
    (data?.patients || []).filter(r => {
      const src = r._id.source?.trim() || '';
      return !EXCLUDED.has(src) && r._id.month && r._id.year;
    }),
  [data]);

  // Available years derived from data, sorted asc
  const availableYears = useMemo(() =>
    Array.from(new Set(cleanRows.map(r => r._id.year))).sort(),
  [cleanRows]);

  // Max year+month in data (for Last 90d reference)
  const maxYM = useMemo(() => {
    if (!cleanRows.length) return null;
    return cleanRows.reduce((best, r) => {
      const v = r._id.year * 12 + r._id.month;
      return v > best.v ? { v, year: r._id.year, month: r._id.month } : best;
    }, { v: 0, year: 0, month: 0 });
  }, [cleanRows]);

  // Filtered rows based on active filter
  const filteredRows = useMemo(() => {
    if (filter === 'year') return cleanRows.filter(r => r._id.year === selYear);
    if (filter === 'last90' && maxYM) {
      // Last 90d ≈ last 3 months from the most recent month in data
      const refVal = maxYM.year * 12 + maxYM.month;
      return cleanRows.filter(r => (r._id.year * 12 + r._id.month) >= refVal - 2);
    }
    return cleanRows; // 'all'
  }, [cleanRows, filter, selYear, maxYM]);

  // Build chart data: { month, Source1: n, Source2: n, _total: n }
  const { chartData, srcList, dateRangeLabel } = useMemo(() => {
    const rowsMap: Record<string, Record<string, number>> = {};
    const srcSet  = new Set<string>();

    filteredRows.forEach(r => {
      const src = r._id.source.trim();
      const key = `${MONTHS[r._id.month-1]} '${String(r._id.year).slice(2)}`;
      if (!rowsMap[key]) rowsMap[key] = {};
      srcSet.add(src);
      rowsMap[key][src] = (rowsMap[key][src] || 0) + r.count;
    });

    // Sort months chronologically
    const sorted = Object.entries(rowsMap).sort((a, b) => {
      const [ma, ya] = a[0].split(' ');
      const [mb, yb] = b[0].split(' ');
      const va = parseInt('20' + ya.slice(1)) * 12 + MONTHS.indexOf(ma);
      const vb = parseInt('20' + yb.slice(1)) * 12 + MONTHS.indexOf(mb);
      return va - vb;
    });

    // Add total per bar for label
    const chart = sorted.map(([month, vals]) => ({
      month,
      ...vals,
      _total: Object.values(vals).reduce((s, v) => s + v, 0),
    }));

    const srcs = Array.from(srcSet).slice(0, 10);

    // Date range subtitle
    let label = '';
    if (chart.length > 0) {
      const first = chart[0].month;
      const last  = chart[chart.length - 1].month;
      label = first === last ? first : `${first} to ${last}`;
    }

    return { chartData: chart, srcList: srcs, dateRangeLabel: label };
  }, [filteredRows]);

  // Ranked totals for the source list (filtered)
  const { ranked, grandTotal } = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredRows.forEach(r => {
      totals[r._id.source.trim()] = (totals[r._id.source.trim()] || 0) + r.count;
    });
    const gt = Object.values(totals).reduce((a, b) => a + b, 0);
    return {
      ranked: Object.entries(totals).sort((a, b) => b[1] - a[1]),
      grandTotal: gt,
    };
  }, [filteredRows]);

  const router = useRouter();

  // Click a bar segment → go to patients filtered by that source + month
  const handleBarClick = (data: Record<string, unknown>, source: string) => {
    if (!data?.month) return;
    const monthStr = data.month as string; // e.g. "Sep '25"
    const [mon, yr] = monthStr.split(' ');
    const monthIdx  = MONTHS.indexOf(mon) + 1;
    const year      = parseInt('20' + yr.replace("'", ''));
    if (!monthIdx || !year) return;
    const from = new Date(year, monthIdx - 1, 1).toISOString().slice(0, 10);
    const to   = new Date(year, monthIdx,     0).toISOString().slice(0, 10);
    router.push(`/patients?referralSource=${encodeURIComponent(source)}&dateFrom=${from}&dateTo=${to}`);
  };

  if (loading) return <div className="p-6"><PageSpinner /></div>;

  return (
    <div className="p-6 space-y-5">
      <h1 className="page-title">Referral Analytics</h1>

      {/* Chart card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h3 className="section-title">Referral Sources by Month</h3>
            {dateRangeLabel && (
              <p className="text-xs text-slate-400 mt-0.5">
                Total referrals per source — {dateRangeLabel}
              </p>
            )}
          </div>

          {/* Filter pills + year dropdown */}
          <div className="flex items-center gap-2 flex-wrap">
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All Time</Pill>

            {/* Year pills — up to 4, then overflow into dropdown */}
            {availableYears.slice(0, 4).map(yr => (
              <Pill key={yr}
                active={filter === 'year' && selYear === yr}
                onClick={() => { setFilter('year'); setSelYear(yr); }}>
                {yr}
              </Pill>
            ))}

            {/* Year dropdown if > 4 years */}
            {availableYears.length > 4 && (
              <select
                value={filter === 'year' ? selYear : ''}
                onChange={e => { setFilter('year'); setSelYear(Number(e.target.value)); }}
                className={cn(
                  'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors outline-none cursor-pointer',
                  filter === 'year'
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-brand'
                )}>
                <option value="">Year…</option>
                {availableYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
              </select>
            )}

            <Pill active={filter === 'last90'} onClick={() => setFilter('last90')}>Last 90d</Pill>
          </div>
        </div>

        {/* Chart */}
        <div className="px-5 py-4">
          {chartData.length === 0
            ? <div className="flex items-center justify-center h-48 text-sm text-slate-400">No referral data for this period</div>
            : <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  {srcList.map((src, i) => (
                    <Bar key={src} dataKey={src} stackId="a"
                      fill={BAR_COLORS[i % BAR_COLORS.length]}
                      radius={i === srcList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => handleBarClick(data as Record<string, unknown>, src)}>
                      {i === srcList.length - 1 && (
                        <LabelList dataKey="_total" position="top"
                          style={{ fontSize: 11, fontWeight: 600, fill: '#475569' }} />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* Ranked sources */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title">Top Referral Sources</h3>
          <span className="text-xs text-slate-400">{grandTotal} total referrals</span>
        </div>
        <div className="space-y-3">
          {ranked.map(([src, count], i) => {
            const pct = grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0;
            return (
              <div key={src} className="flex items-center gap-3 cursor-pointer group"
                onClick={() => router.push(`/patients?referralSource=${encodeURIComponent(src)}`)}>
                <span className="text-xs font-bold text-slate-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 group-hover:text-brand transition-colors">{src}</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {count} <span className="text-xs font-normal text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
          {ranked.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-6">No data for this period</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
        active
          ? 'bg-brand text-white border-brand shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand'
      )}>
      {children}
    </button>
  );
}
