'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtDate, timeAgo, statusColor, cn } from '@/lib/utils';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { StatusBadge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Spinner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Users, UserCheck, Clock, CheckCircle2, TrendingUp,
  BarChart2, ClipboardList, CalendarClock, Calendar,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface Stats {
  totalLeads: number; totalPatients: number; activePatients: number;
  completePatients: number; deniedPatients: number; conversionRate: number;
  formsRate: number; avgIntakeToFeedbackDays: number | null;
  recentActivity: { _id: string; userName: string; action: string; entityType: string; entityId?: string; timestamp: string }[];
}
interface Appts { intake: P[]; test: P[]; feedback: P[]; gfe: P[]; config: Record<string,number> }
interface P { _id: string; name: string; phone?: string; intakeAppt?: string; testAppt?: string; feedbackAppt?: string; gfeSent?: string }
interface ProcessData {
  last30: Metrics; last60: Metrics; ytd: Metrics;
  monthly: { _id: { year: number; month: number }; avgI2T: number; avgT2F: number; avgI2F: number; count: number }[];
}
interface Metrics { avgIntakeToTest: number|null; avgTestToFeedback: number|null; avgIntakeToFeedback: number|null; formsCompletionPct: number }
interface ReferralData { patients: { _id: { source: string; year: number; month: number }; count: number }[] }
interface NewPatientEntry { _id: { year: number; month: number; day: number }; count: number }
interface FormsStats { total: number; formsSentPct: number; formsRecPct: number; apptSetPct: number; formsSentCount: number; formsRecCount: number; apptSetCount: number }
interface StatusEntry { _id: string; count: number }

type DatePreset = 'today' | 'week' | 'month' | 'custom';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getPresetDates(preset: DatePreset): { dateFrom: string; dateTo: string } {
  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const fmt   = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  if (preset === 'today') return { dateFrom: today, dateTo: today };
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { dateFrom: fmt(start), dateTo: today };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: fmt(start), dateTo: today };
  }
  return { dateFrom: '', dateTo: '' };
}
const PIE_COLORS = { 'In Progress': '#3B82F6', 'Complete': '#10B981', 'Denied': '#EF4444', 'On Hold': '#F59E0B', 'Not Moving Forward': '#94A3B8', 'No Response': '#F97316' };

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [stats,           setStats]           = useState<Stats|null>(null);
  const [appts,           setAppts]           = useState<Appts|null>(null);
  const [process,         setProcess]         = useState<ProcessData|null>(null);
  const [referral,        setReferral]        = useState<ReferralData|null>(null);
  const [loading,         setLoading]         = useState(true);
  const [newPatients,     setNewPatients]     = useState<NewPatientEntry[]>([]);
  const [formsStats,      setFormsStats]      = useState<FormsStats|null>(null);
  const [statusBreakdown, setStatusBreakdown] = useState<StatusEntry[]>([]);
  const [datePreset,      setDatePreset]      = useState<DatePreset>('month');
  const [customFrom,      setCustomFrom]      = useState('');
  const [customTo,        setCustomTo]        = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, a, pr, ref] = await Promise.allSettled([
      api.get<Stats>('/dashboard/stats'),
      api.get<Appts>('/dashboard/appointments'),
      api.get<ProcessData>('/dashboard/process'),
      api.get<ReferralData>('/dashboard/referrals'),
    ]);
    if (s.status  === 'fulfilled') setStats(s.value);
    if (a.status  === 'fulfilled') setAppts(a.value);
    if (pr.status === 'fulfilled') setProcess(pr.value);
    if (ref.status=== 'fulfilled') setReferral(ref.value);
    setLoading(false);
  }, []);

  const loadAnalytics = useCallback(async (preset: DatePreset, from: string, to: string) => {
    const { dateFrom, dateTo } = preset === 'custom'
      ? { dateFrom: from, dateTo: to }
      : getPresetDates(preset);
    if (preset === 'custom' && (!from || !to)) return;
    setAnalyticsLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo)   params.set('dateTo',   dateTo);
    const qs = params.toString() ? `?${params}` : '';
    const [np, fs, sb] = await Promise.allSettled([
      api.get<{ data: NewPatientEntry[] }>(`/dashboard/new-patients${qs}`),
      api.get<FormsStats>(`/dashboard/forms-stats${qs}`),
      api.get<{ data: StatusEntry[] }>(`/dashboard/status-breakdown${qs}`),
    ]);
    if (np.status === 'fulfilled') setNewPatients(np.value.data);
    if (fs.status === 'fulfilled') setFormsStats(fs.value);
    if (sb.status === 'fulfilled') setStatusBreakdown(sb.value.data);
    setAnalyticsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAnalytics(datePreset, customFrom, customTo); }, [loadAnalytics, datePreset, customFrom, customTo]);

  /* ── Referral chart data ─────────────────────────────────────────────────── */
  const referralChartData = (() => {
    if (!referral?.patients) return [];
    const map: Record<string, Record<string, number>> = {};
    const sources = new Set<string>();
    referral.patients.forEach(r => {
      const key = `${MONTHS[r._id.month-1]} ${r._id.year}`;
      if (!map[key]) map[key] = {};
      const src = r._id.source || 'Other';
      sources.add(src);
      map[key][src] = (map[key][src] || 0) + r.count;
    });
    return Object.entries(map).slice(-6).map(([month, vals]) => ({ month, ...vals }));
  })();

  const referralSources = Array.from(new Set(referral?.patients?.map(r => r._id.source || 'Other') || [])).slice(0,8);

  /* ── Status donut data ──────────────────────────────────────────────────── */
  const statusData = (() => {
    if (!stats) return [];
    return [
      { name: 'In Progress',        value: stats.activePatients },
      { name: 'Complete',           value: stats.completePatients },
      { name: 'Denied/NMF',         value: stats.deniedPatients },
    ].filter(d => d.value > 0);
  })();

  /* ── Process line chart ─────────────────────────────────────────────────── */
  const processChartData = (process?.monthly || []).slice(-8).map(m => ({
    month: `${MONTHS[m._id.month-1]} '${String(m._id.year).slice(2)}`,
    'Intake→Test':    m.avgI2T ? Math.round(m.avgI2T) : null,
    'Test→Feedback':  m.avgT2F ? Math.round(m.avgT2F) : null,
    'Intake→Feedback':m.avgI2F ? Math.round(m.avgI2F) : null,
  }));

  /* ── Outstanding tasks count ─────────────────────────────────────────────── */
  const tasksCount = (appts as unknown as { missingIntake?: unknown[]; missingTest?: unknown[]; missingFeedback?: unknown[] } | null);

  /* ── New patients chart data ────────────────────────────────────────────── */
  const newPatientsChartData = newPatients.map(e => ({
    date: `${e._id.month}/${e._id.day}`,
    'New Patients': e.count,
  }));

  /* ── Status breakdown chart data ─────────────────────────────────────────── */
  const STATUS_BAR_COLORS: Record<string,string> = {
    'In Progress': '#3B82F6', 'Complete': '#10B981', 'Denied': '#EF4444',
    'On Hold': '#F59E0B', 'Not Moving Forward': '#94A3B8', 'No Response': '#F97316',
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="page-title">Dashboard</h1>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? Array(8).fill(0).map((_,i) => <SkeletonCard key={i} />) : <>
          <KpiCard icon={UserCheck}    color="blue"   label="Total Patients"       value={stats?.totalPatients ?? 0}           href="/patients" />
          <KpiCard icon={Clock}        color="amber"  label="Active (In Progress)" value={stats?.activePatients ?? 0}          href="/patients?status=In+Progress" />
          <KpiCard icon={CheckCircle2} color="green"  label="Completed"            value={stats?.completePatients ?? 0}        href="/patients?status=Complete" />
          <KpiCard icon={TrendingUp}   color="purple" label="Avg Intake→Feedback"  value={stats?.avgIntakeToFeedbackDays ?? 0} href="/process" suffix=" days" />
          <KpiCard icon={Users}        color="slate"  label="Open Leads"           value={stats?.totalLeads ?? 0}              href="/leads" />
          <KpiCard icon={TrendingUp}   color="cyan"   label="Lead→Patient Rate"    value={stats?.conversionRate ?? 0}          href="/referrals" suffix="%" />
          <KpiCard icon={BarChart2}    color="teal"   label="Forms Completion"     value={stats?.formsRate ?? 0}               href="/patients" suffix="%" />
          <KpiCard icon={ClipboardList}color="red"    label="Denied / NMF"         value={stats?.deniedPatients ?? 0}          href="/patients?status=Denied" />
        </>}
      </div>

      {/* ── Date Range Filter Bar ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={16} className="text-slate-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-600 mr-1">View by:</span>
          {(['today','week','month'] as DatePreset[]).map(p => (
            <button key={p} onClick={() => setDatePreset(p)}
              className={cn('text-sm px-4 py-1.5 rounded-lg font-medium transition-colors border',
                datePreset === p
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand')}>
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
          <button onClick={() => setDatePreset('custom')}
            className={cn('text-sm px-4 py-1.5 rounded-lg font-medium transition-colors border',
              datePreset === 'custom'
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand')}>
            Custom
          </button>
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" className="input-base text-sm py-1.5" value={customFrom}
                onChange={e => setCustomFrom(e.target.value)} />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" className="input-base text-sm py-1.5" value={customTo}
                onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Analytics Sections (date-filtered) ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* New Patients Chart */}
        <div className="xl:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="section-title mb-4">New Patients Added</h3>
          {analyticsLoading
            ? <div className="flex items-center justify-center h-[180px] text-sm text-slate-400">Loading…</div>
            : newPatientsChartData.length === 0
              ? <Empty text="No new patients in this period" />
              : <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={newPatientsChartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="New Patients" fill="#3B82F6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
          }
        </div>

        {/* Form Completion % Tiles */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="section-title mb-4">Process Completion</h3>
          {analyticsLoading
            ? <div className="space-y-4">{Array(3).fill(0).map((_,i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            : formsStats
              ? <div className="space-y-4">
                  {[
                    { label: 'Forms Sent',      pct: formsStats.formsSentPct,  count: formsStats.formsSentCount,  color: 'bg-blue-500' },
                    { label: 'Forms Received',  pct: formsStats.formsRecPct,   count: formsStats.formsRecCount,   color: 'bg-emerald-500' },
                    { label: 'Appt Set',        pct: formsStats.apptSetPct,    count: formsStats.apptSetCount,    color: 'bg-purple-500' },
                  ].map(({ label, pct, count, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                        <span className="font-medium">{label}</span>
                        <span className="font-semibold">{pct}% <span className="text-slate-400 font-normal">({count}/{formsStats.total})</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400 pt-1">{formsStats.total} patients in period</p>
                </div>
              : <Empty text="No data" />
          }
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="section-title mb-4">Status Breakdown</h3>
        {analyticsLoading
          ? <div className="flex items-center justify-center h-[160px] text-sm text-slate-400">Loading…</div>
          : statusBreakdown.length === 0
            ? <Empty text="No patient data in this period" />
            : <div className="space-y-3">
                {statusBreakdown.map(s => {
                  const total = statusBreakdown.reduce((acc, x) => acc + x.count, 0);
                  const pct   = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  const color = STATUS_BAR_COLORS[s._id] || '#94A3B8';
                  return (
                    <div key={s._id} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-40 flex-shrink-0">{s._id || 'Unknown'}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-sm font-semibold text-slate-700 w-16 text-right">{s.count} <span className="text-slate-400 font-normal text-xs">({pct}%)</span></span>
                    </div>
                  );
                })}
              </div>
        }
      </div>

      {/* ── Charts row 1 ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Referral bar chart */}
        <div className="xl:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="section-title mb-4">Referral Sources by Month</h3>
          {referralChartData.length === 0
            ? <Empty text="No referral data yet" />
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={referralChartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {referralSources.map((src, i) => (
                    <Bar key={src} dataKey={src} stackId="a" fill={`hsl(${(i * 47) % 360},65%,55%)`} radius={i === referralSources.length-1 ? [4,4,0,0] : [0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Status donut */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="section-title mb-4">Patient Status</h3>
          {statusData.length === 0
            ? <Empty text="No patient data yet" />
            : <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={(PIE_COLORS as Record<string,string>)[entry.name] || '#94A3B8'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* ── Charts row 2 ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Cycle time line chart */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="section-title mb-4">Process Cycle Times (days)</h3>
          {processChartData.length === 0
            ? <Empty text="No cycle time data yet" />
            : <ResponsiveContainer width="100%" height={200}>
                <LineChart data={processChartData} margin={{ top: 0, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Intake→Test"    stroke="#3B82F6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Test→Feedback"  stroke="#F59E0B" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Intake→Feedback"stroke="#8B5CF6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Process KPI callout table */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="section-title mb-4">Process KPI Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs text-slate-500 pb-2 font-medium">Metric</th>
                  <th className="text-center text-xs text-slate-500 pb-2 font-medium">30 Days</th>
                  <th className="text-center text-xs text-slate-500 pb-2 font-medium">60 Days</th>
                  <th className="text-center text-xs text-slate-500 pb-2 font-medium">YTD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  ['Intake→Test avg',     'avgIntakeToTest',     'd'],
                  ['Test→Feedback avg',   'avgTestToFeedback',   'd'],
                  ['Intake→Feedback avg', 'avgIntakeToFeedback', 'd'],
                  ['Forms Completion',    'formsCompletionPct',  '%'],
                ].map(([label, key, unit]) => (
                  <tr key={key}>
                    <td className="py-2 text-slate-600">{label}</td>
                    {(['last30','last60','ytd'] as const).map(period => (
                      <td key={period} className="py-2 text-center font-medium text-slate-800">
                        {process?.[period]?.[key as keyof Metrics] != null
                          ? `${process[period][key as keyof Metrics]}${unit}`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Upcoming Appointments ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CalendarClock size={18} className="text-brand" />
          <h3 className="section-title">Upcoming Appointments</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <ApptPanel title="Intake" days={appts?.config?.intake ?? 7}   patients={appts?.intake   ?? []} dateField="intakeAppt" />
          <ApptPanel title="Test"   days={appts?.config?.test ?? 7}     patients={appts?.test     ?? []} dateField="testAppt" />
          <ApptPanel title="Feedback" days={appts?.config?.feedback ?? 7} patients={appts?.feedback ?? []} dateField="feedbackAppt" />
          <ApptPanel title="GFE Sent" days={appts?.config?.gfeLookback ?? 100} patients={appts?.gfe ?? []} dateField="gfeSent" lookback />
        </div>
      </div>

      {/* ── Recent Activity ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="section-title">Recent Activity</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {(stats?.recentActivity || []).length === 0
            ? <p className="px-5 py-8 text-sm text-slate-400 text-center">No activity yet</p>
            : (stats?.recentActivity || []).map(log => (
                <div key={log._id}
                  onClick={() => {
                    if (!log.entityId) return;
                    // leads have no detail page — go to leads list; patients go to detail
                    window.location.href = log.entityType === 'patient'
                      ? `/patients/${log.entityId}`
                      : `/leads`;
                  }}
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(log.userName || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-700">{log.userName}</span>
                      <span className="text-sm text-slate-500"> {log.action} a </span>
                      <span className="text-sm font-medium text-brand">{log.entityType}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap ml-4">{timeAgo(log.timestamp)}</span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */
const KPI_COLORS: Record<string,string> = {
  blue:   'bg-blue-50 text-blue-600',   amber:  'bg-amber-50 text-amber-600',
  green:  'bg-emerald-50 text-emerald-600', purple: 'bg-purple-50 text-purple-600',
  slate:  'bg-slate-100 text-slate-600',cyan:   'bg-cyan-50 text-cyan-600',
  teal:   'bg-teal-50 text-teal-600',   red:    'bg-red-50 text-red-600',
};

function KpiCard({ icon: Icon, color, label, value, suffix = '', href }: { icon: React.ElementType; color: string; label: string; value: number; suffix?: string; href?: string }) {
  const router = useRouter();
  return (
    <div
      onClick={() => href && router.push(href)}
      className={cn('stat-card flex items-center gap-4 transition-all duration-150', href ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : '')}
    >
      <div className={cn('p-3 rounded-xl flex-shrink-0', KPI_COLORS[color] || 'bg-slate-100 text-slate-600')}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium leading-none mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900">
          <AnimatedCounter value={value} />{suffix}
        </p>
      </div>
    </div>
  );
}

function ApptPanel({ title, days, patients, dateField, lookback }: { title: string; days: number; patients: P[]; dateField: keyof P; lookback?: boolean }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <span className="text-xs text-slate-400">{lookback ? `Last ${days}d` : `Next ${days}d`}</span>
      </div>
      {patients.length === 0
        ? <p className="text-xs text-slate-400 text-center py-4">None</p>
        : <ul className="space-y-1">
            {patients.slice(0,8).map(p => (
              <li key={p._id}
                onClick={() => window.location.href = `/patients/${p._id}`}
                className="flex items-center justify-between px-1 py-1 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group">
                <div className="min-w-0 flex-1 mr-2">
                  {p.name
                    ? <span className="text-sm text-slate-700 truncate group-hover:text-brand">{p.name}</span>
                    : <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⚠ Add name</span>
                  }
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{fmtDate(p[dateField] as string)}</span>
              </li>
            ))}
            {patients.length > 8 && (
              <li onClick={() => window.location.href = '/appointments'}
                className="text-xs text-brand cursor-pointer hover:underline pt-1">
                +{patients.length - 8} more — view all
              </li>
            )}
          </ul>
      }
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-[200px] text-sm text-slate-400">{text}</div>;
}
