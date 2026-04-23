'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { Patient } from '@/types';

interface TaskData {
  missingIntake: Patient[];
  missingTest: Patient[];
  missingFeedback: Patient[];
}

export default function TasksPage() {
  const [data,    setData]    = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api.get<TaskData>('/dashboard/tasks')); }
    catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6"><PageSpinner /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Outstanding Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {((data?.missingIntake?.length ?? 0) + (data?.missingTest?.length ?? 0) + (data?.missingFeedback?.length ?? 0))} tasks need attention
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw size={13} /> Refresh</button>
      </div>

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
