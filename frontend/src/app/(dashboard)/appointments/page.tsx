'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { PageSpinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import type { Patient } from '@/types';

interface ApptData {
  intake: Patient[]; test: Patient[]; feedback: Patient[]; gfe: Patient[];
  config: { intake: number; test: number; feedback: number; gfeLookback: number };
}

export default function AppointmentsPage() {
  const [data,    setData]    = useState<ApptData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api.get<ApptData>('/dashboard/appointments')); }
    catch { toast.error('Failed to load appointments'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6"><PageSpinner /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Upcoming Appointments</h1>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw size={13} /> Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <ApptPanel title="Intake Appointments"  days={data?.config.intake ?? 7}         patients={data?.intake   ?? []} field="intakeAppt" />
        <ApptPanel title="Test Appointments"    days={data?.config.test ?? 7}           patients={data?.test     ?? []} field="testAppt" />
        <ApptPanel title="Feedback Appointments"days={data?.config.feedback ?? 7}       patients={data?.feedback ?? []} field="feedbackAppt" />
        <ApptPanel title="GFE Sent"             days={data?.config.gfeLookback ?? 100}  patients={data?.gfe     ?? []} field="gfeSent" lookback />
      </div>
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
                <div>
                  <p className="text-sm font-medium text-slate-700 group-hover:text-brand transition-colors">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.phone || ''}</p>
                </div>
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap ml-2">
                  {fmtDate(p[field] as string)}
                </span>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
