'use client';

import { useEffect, useState, useCallback } from 'react';
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
  BarChart2, ClipboardList, CalendarClock,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface Stats {
  totalLeads: number; totalPatients: number; activePatients: number;
  completePatients: number; deniedPatients: number; conversionRate: number;
  formsRate: number; avgIntakeToFeedbackDays: number | null;
  recentActivity: { _id: string; userName: string; action: string; entityType: string; timestamp: string }[];
}
interface Appts { intake: P[]; test: P[]; feedback: P[]; gfe: P[]; config: Record<string,number> }
interface P { _id: string; name: string; phone?: string; intakeAppt?: string; testAppt?: string; feedbackAppt?: string; gfeSent?: string }
interface ProcessData {
  last30: Metrics; last60: Metrics; ytd: Metrics;
  monthly: { _id: { year: number; month: number }; avgI2T: number; avgT2F: number; avgI2F: number; count: number }[];
}
interface Metrics { avgIntakeToTest: number|null; avgTestToFeedback: number|null; avgIntakeToFeedback: number|null; formsCompletionPct: number }
interface ReferralData { patients: { _id: { source: string; year: number; month: number }; count: number }[] }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PIE_COLORS = { 'In Progress': '#3B82F6', 'Complete': '#10B981', 'Denied': '#EF4444', 'On Hold': '#F59E0B', 'Not Moving Forward': '#94A3B8', 'No Response': '#F97316' };

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [stats,    setStats]    = useState<Stats|null>(null);
  const [appts,    setAppts]    = useState<Appts|null>(null);
  const [process,  setProcess]  = useState<ProcessData|null>(null);
  const [referral, setReferral] = useState<ReferralData|null>(null);
  const [loading,  setLoading]  = useState(true);

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

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="p-6 space-y-6">
      <h1 className="page-title">Dashboard</h1>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? Array(8).fill(0).map((_,i) => <SkeletonCard key={i} />) : <>
          <KpiCard icon={UserCheck}    color="blue"   label="Total Patients"       value={stats?.totalPatients ?? 0} />
          <KpiCard icon={Clock}        color="amber"  label="Active (In Progress)" value={stats?.activePatients ?? 0} />
          <KpiCard icon={CheckCircle2} color="green"  label="Completed"            value={stats?.completePatients ?? 0} />
          <KpiCard icon={TrendingUp}   color="purple" label="Avg Intake→Feedback"  value={stats?.avgIntakeToFeedbackDays ?? 0} suffix=" days" />
          <KpiCard icon={Users}        color="slate"  label="Open Leads"           value={stats?.totalLeads ?? 0} />
          <KpiCard icon={TrendingUp}   color="cyan"   label="Lead→Patient Rate"    value={stats?.conversionRate ?? 0} suffix="%" />
          <KpiCard icon={BarChart2}    color="teal"   label="Forms Completion"      value={stats?.formsRate ?? 0} suffix="%" />
          <KpiCard icon={ClipboardList}color="red"    label="Denied / NMF"          value={stats?.deniedPatients ?? 0} />
        </>}
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
                <div key={log._id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(log.userName || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-slate-700">{log.userName}</span>
                      <span className="text-sm text-slate-500"> {log.action} a </span>
                      <span className="text-sm font-medium text-slate-700">{log.entityType}</span>
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

function KpiCard({ icon: Icon, color, label, value, suffix = '' }: { icon: React.ElementType; color: string; label: string; value: number; suffix?: string }) {
  return (
    <div className="stat-card flex items-center gap-4">
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
        : <ul className="space-y-2">
            {patients.slice(0,8).map(p => (
              <li key={p._id} className="flex items-center justify-between">
                <span className="text-sm text-slate-700 truncate mr-2">{p.name}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(p[dateField] as string)}</span>
              </li>
            ))}
            {patients.length > 8 && <li className="text-xs text-brand">+{patients.length - 8} more</li>}
          </ul>
      }
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-[200px] text-sm text-slate-400">{text}</div>;
}
