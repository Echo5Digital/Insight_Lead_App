'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Field, Select, Input, Textarea } from '@/components/ui/FormField';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, CheckCircle, User, Calendar, DollarSign } from 'lucide-react';
import type { Settings, Patient } from '@/types';

const STEPS = [
  { label: 'Identity',       icon: User },
  { label: 'Process Dates',  icon: Calendar },
  { label: 'Financials',     icon: DollarSign },
];

type FormData = Partial<Patient> & Record<string, string | number | null>;

function NewPatientForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useAuth();

  // Pre-fill category from query param (e.g. ?category=Pain+Management)
  const rawCategory = searchParams.get('category') || 'Standard';

  const [step,     setStep]     = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form,     setForm]     = useState<FormData>({ status: 'In Progress', category: rawCategory } as any);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!user || user.role === 'readonly') { router.push('/patients'); return; }
    api.get<Settings>('/settings').then(setSettings).catch(() => {});
  }, [user, router]);

  const set = (key: string, val: string | number | null) => setForm(p => ({ ...p, [key]: val }));
  const g   = (key: string) => (form[key] as string) || '';

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ patientId: string }>('/patients', form);
      toast.success('Patient created!');
      router.push(`/patients/${res.patientId}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  // Auto-calc preview
  const calcDays = (a?: string, b?: string) => {
    if (!a || !b) return null;
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
    return diff >= 0 ? diff : null;
  };

  const i2t = calcDays(g('intakeAppt'), g('testAppt'));
  const t2f = calcDays(g('testAppt'), g('feedbackAppt'));
  const i2f = calcDays(g('intakeAppt'), g('feedbackAppt'));

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title">
          Add New {rawCategory === 'Pain Management' ? 'Pain Management ' : ''}Patient
        </h1>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center text-center">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                i < step  ? 'bg-emerald-500 border-emerald-500 text-white' :
                i === step ? 'bg-brand border-brand text-white' :
                             'bg-white border-slate-200 text-slate-400')}>
                {i < step ? <CheckCircle size={18} /> : <s.icon size={16} />}
              </div>
              <span className={cn('text-xs mt-1.5 font-medium', i === step ? 'text-brand' : i < step ? 'text-emerald-600' : 'text-slate-400')}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-3 mb-5', i < step ? 'bg-emerald-400' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">

        {/* Step 1: Identity */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" required className="col-span-2">
                <Input value={g('name')} onChange={e => set('name', e.target.value)} placeholder="Patient full name" />
              </Field>
              <Field label="Phone"><Input value={g('phone')} onChange={e => set('phone', e.target.value)} placeholder="405-000-0000" /></Field>
              <Field label="Date of Birth"><Input type="date" value={g('dob')} onChange={e => set('dob', e.target.value)} /></Field>
              <Field label="Email" className="col-span-2"><Input type="email" value={g('email')} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Insurance">
                <Select options={settings?.insuranceList || []} placeholder="Select insurance…" value={g('insurance')} onChange={e => set('insurance', e.target.value)} />
              </Field>
              <Field label="Category">
                <Select options={['Standard','Pain Management']} value={g('category')} onChange={e => set('category', e.target.value)} />
              </Field>
              <Field label="Referral Source" className="col-span-2">
                <Select options={settings?.referralSourceList || []} placeholder="Select source…" value={g('referralSource')} onChange={e => set('referralSource', e.target.value)} />
              </Field>
              <Field label="Status" className="col-span-2">
                <Select options={settings?.statusList || ['In Progress','Complete','On Hold','Denied','No Response','Not Moving Forward']} value={g('status')} onChange={e => set('status', e.target.value)} />
              </Field>
              <Field label="Notes" className="col-span-2">
                <Textarea rows={3} value={g('notes')} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" />
              </Field>
            </div>
          </div>
        )}

        {/* Step 2: Process Dates */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 mb-4">Fill in all known milestone dates. Leave blank if not yet reached.</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Referral Date',       'referralDate'],
                ['Referral Confirmed',  'referralRecDate'],
                ['Forms Sent',          'formsSent'],
                ['Forms Received',      'formsRec'],
                ['Pre-Auth Sent',       'preAuthSent'],
                ['Pre-Auth Received',   'preAuthRec'],
                ['GFE Sent',            'gfeSent'],
                ['GFE Received',        'gfeRec'],
                ['Intake Appointment',  'intakeAppt'],
                ['Test Appointment',    'testAppt'],
                ['Feedback Appointment','feedbackAppt'],
              ].map(([label, key]) => (
                <Field key={key} label={label}>
                  <Input type="date" value={g(key)} onChange={e => set(key, e.target.value)} />
                </Field>
              ))}
            </div>
            {/* Live cycle preview */}
            {(i2t != null || t2f != null || i2f != null) && (
              <div className="bg-slate-50 rounded-xl p-4 mt-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">Calculated Cycle Times</p>
                <div className="flex gap-3 flex-wrap">
                  {i2t != null && <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full">Intake→Test: {i2t}d</span>}
                  {t2f != null && <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full">Test→Feedback: {t2f}d</span>}
                  {i2f != null && <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full">Intake→Feedback: {i2f}d</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Financials */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 mb-4">Enter financial information. Leave blank if not yet applicable.</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Co-Pay',        'copay'],
                ['Intake Paid',   'intakePaid'],
                ['Testing Paid',  'testingPaid'],
                ['Balance',       'balance'],
                ['Intake PD',     'intakePD'],
                ['Test PD',       'testPD'],
                ['Feedback PD',   'feedbackPD'],
              ].map(([label, key]) => (
                <Field key={key} label={label}>
                  <Input type="number" step="0.01" placeholder="0.00" value={g(key)} onChange={e => set(key, e.target.value)} />
                </Field>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-slate-50 rounded-xl p-4 mt-2">
              <p className="text-xs font-semibold text-slate-500 mb-3">Patient Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">Name:</span> <span className="font-medium">{g('name') || '—'}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium">{g('status')}</span></div>
                <div><span className="text-slate-500">Insurance:</span> <span className="font-medium">{g('insurance') || '—'}</span></div>
                <div><span className="text-slate-500">Category:</span> <span className="font-medium">{g('category')}</span></div>
                {i2f != null && <div className="col-span-2"><span className="text-slate-500">Total Cycle:</span> <span className="font-medium text-brand">{i2f} days</span></div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={() => step === 0 ? router.back() : setStep(s => s - 1)}
          className="btn-secondary flex items-center gap-2">
          <ArrowLeft size={14} />{step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1
          ? <button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !g('name')}
              className="btn-primary flex items-center gap-2">
              Next <ArrowRight size={14} />
            </button>
          : <button onClick={handleSubmit} disabled={saving || !g('name')}
              className="btn-primary flex items-center gap-2">
              {saving ? 'Creating…' : 'Create Patient'} <CheckCircle size={14} />
            </button>
        }
      </div>
    </div>
  );
}

export default function NewPatientPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
      <NewPatientForm />
    </Suspense>
  );
}
