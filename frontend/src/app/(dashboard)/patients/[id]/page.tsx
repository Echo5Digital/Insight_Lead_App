'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtDate, toInputDate, fmtCurrency, timeAgo, cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/Modal';
import { Field, Select, Input, Textarea } from '@/components/ui/FormField';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowLeft, Edit2, Save, X, Trash2, CheckCircle, Circle } from 'lucide-react';
import type { Patient, AuditLog, Settings } from '@/types';

const MILESTONES = [
  { key: 'referralDate',   label: 'Referral' },
  { key: 'referralRecDate',label: 'Ref. Confirmed' },
  { key: 'formsSent',      label: 'Forms Sent' },
  { key: 'formsRec',       label: 'Forms Rec' },
  { key: 'preAuthSent',    label: 'Pre-Auth Sent' },
  { key: 'preAuthRec',     label: 'Pre-Auth Rec' },
  { key: 'gfeSent',        label: 'GFE Sent' },
  { key: 'gfeRec',         label: 'GFE Rec' },
  { key: 'intakeAppt',     label: 'Intake Appt' },
  { key: 'testAppt',       label: 'Test Appt' },
  { key: 'feedbackAppt',   label: 'Feedback Appt' },
] as const;

type MilestoneKey = typeof MILESTONES[number]['key'];

export default function PatientDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'admin';
  const canWrite  = user?.role === 'admin' || user?.role === 'staff';

  const [patient,    setPatient]    = useState<Patient | null>(null);
  const [auditLog,   setAuditLog]   = useState<AuditLog[]>([]);
  const [settings,   setSettings]   = useState<Settings | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [form,       setForm]       = useState<Partial<Patient>>({});
  const [saving,     setSaving]     = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ patient: p, auditLog: al }, s] = await Promise.all([
        api.get<{ patient: Patient; auditLog: AuditLog[] }>(`/patients/${id}`),
        api.get<Settings>('/settings'),
      ]);
      setPatient(p); setAuditLog(al); setSettings(s);
    } catch { toast.error('Failed to load patient'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => { setForm({ ...patient }); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setForm({}); };

  const f = (key: keyof Patient) => editing
    ? <input className="input-base py-1.5 text-sm" value={form[key] as string ?? ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
    : <span className="text-sm text-slate-700">{String(patient?.[key] ?? '—')}</span>;

  const dateF = (key: MilestoneKey | keyof Patient) => editing
    ? <input type="date" className="input-base py-1.5 text-sm" value={toInputDate(form[key as keyof Patient] as string)} onChange={e => setForm(p => ({ ...p, [key]: e.target.value || null }))} />
    : <span className="text-sm text-slate-700">{fmtDate(patient?.[key as keyof Patient] as string)}</span>;

  const numF = (key: keyof Patient) => editing
    ? <input type="number" step="0.01" className="input-base py-1.5 text-sm" value={form[key] as number ?? ''} onChange={e => setForm(p => ({ ...p, [key]: parseFloat(e.target.value) || null }))} />
    : <span className="text-sm text-slate-700">{fmtCurrency(patient?.[key] as number)}</span>;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/patients/${id}`, form);
      toast.success('Patient saved');
      setEditing(false);
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/patients/${id}`);
      toast.success('Patient deleted');
      router.push('/patients');
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6"><PageSpinner /></div>;
  if (!patient) return <div className="p-6 text-slate-500">Patient not found.</div>;

  // Milestone stepper
  const lastDone = MILESTONES.reduce((acc, m, i) => patient[m.key as keyof Patient] ? i : acc, -1);

  return (
    <div className="p-6">
      {/* Back + title */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{patient.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={patient.status || ''} />
              {patient.category === 'Pain Management' && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Pain Management</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canWrite && !editing && (
            <button onClick={startEdit} className="btn-secondary flex items-center gap-2"><Edit2 size={14} /> Edit</button>
          )}
          {editing && (
            <>
              <button onClick={cancelEdit} className="btn-secondary flex items-center gap-2"><X size={14} /> Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                <Save size={14} />{saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          )}
          {isAdmin && !editing && (
            <button onClick={() => setDeleteOpen(true)} className="btn-danger flex items-center gap-2"><Trash2 size={14} /> Delete</button>
          )}
        </div>
      </div>

      {/* Milestone Stepper */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 mb-5 overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Patient Journey</h3>
        <div className="flex items-start min-w-max gap-0">
          {MILESTONES.map((m, i) => {
            const done    = !!patient[m.key as keyof Patient];
            const current = !done && i === lastDone + 1;
            return (
              <div key={m.key} className="flex items-center">
                <div className="flex flex-col items-center text-center" style={{ width: 80 }}>
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                    done    ? 'bg-emerald-500 border-emerald-500 text-white' :
                    current ? 'bg-brand border-brand text-white' :
                              'bg-white border-slate-200 text-slate-300')}>
                    {done ? <CheckCircle size={16} /> : <Circle size={14} />}
                  </div>
                  <span className={cn('text-[10px] mt-1.5 leading-tight font-medium',
                    done    ? 'text-emerald-600' :
                    current ? 'text-brand' :
                              'text-slate-400')}>
                    {m.label}
                  </span>
                  {done && (
                    <span className="text-[9px] text-slate-400 mt-0.5">
                      {fmtDate(patient[m.key as keyof Patient] as string)}
                    </span>
                  )}
                </div>
                {i < MILESTONES.length - 1 && (
                  <div className={cn('h-0.5 w-6 mt-[-24px]', i < lastDone ? 'bg-emerald-400' : 'bg-slate-200')} />
                )}
              </div>
            );
          })}
        </div>

        {/* Cycle time badges */}
        <div className="flex gap-3 mt-4">
          {patient.intakeToTestDays != null && (
            <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">Intake→Test: {patient.intakeToTestDays} days</span>
          )}
          {patient.testToFeedbackDays != null && (
            <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">Test→Feedback: {patient.testToFeedbackDays} days</span>
          )}
          {patient.intakeToFeedbackDays != null && (
            <span className="text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full font-medium">Intake→Feedback: {patient.intakeToFeedbackDays} days</span>
          )}
        </div>
      </div>

      {/* Left + Right panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Info, Financials, Notes, Audit */}
        <div className="xl:col-span-1 space-y-5">
          {/* Info Card */}
          <Section title="Patient Information">
            <Row label="Name">
              {editing ? <Input className="py-1.5 text-sm" value={form.name || ''} onChange={e => setForm(p => ({...p, name: e.target.value}))} /> : <span className="text-sm text-slate-700">{patient.name}</span>}
            </Row>
            <Row label="Phone">{f('phone')}</Row>
            <Row label="Email">{f('email')}</Row>
            <Row label="DOB">{dateF('dob')}</Row>
            <Row label="Status">
              {editing
                ? <Select options={settings?.statusList || []} value={form.status || ''} onChange={e => setForm(p => ({...p, status: e.target.value}))} />
                : <StatusBadge status={patient.status || ''} />
              }
            </Row>
            <Row label="Category">
              {editing
                ? <Select options={['Standard','Pain Management']} value={form.category || 'Standard'} onChange={e => setForm(p => ({...p, category: e.target.value as Patient['category']}))} />
                : <span className="text-sm text-slate-700">{patient.category || 'Standard'}</span>
              }
            </Row>
            <Row label="Insurance">
              {editing
                ? <Select options={settings?.insuranceList || []} placeholder="Select…" value={form.insurance || ''} onChange={e => setForm(p => ({...p, insurance: e.target.value}))} />
                : <span className="text-sm text-slate-700">{patient.insurance || '—'}</span>
              }
            </Row>
            <Row label="Referral Source">
              {editing
                ? <Select options={settings?.referralSourceList || []} placeholder="Select…" value={form.referralSource || ''} onChange={e => setForm(p => ({...p, referralSource: e.target.value}))} />
                : <span className="text-sm text-slate-700">{patient.referralSource || '—'}</span>
              }
            </Row>
          </Section>

          {/* Financials */}
          <Section title="Financials">
            <Row label="Co-Pay">{numF('copay')}</Row>
            <Row label="Intake Paid">{numF('intakePaid')}</Row>
            <Row label="Testing Paid">{numF('testingPaid')}</Row>
            <Row label="Balance">{numF('balance')}</Row>
            <Row label="Intake PD">{numF('intakePD')}</Row>
            <Row label="Test PD">{numF('testPD')}</Row>
            <Row label="Feedback PD">{numF('feedbackPD')}</Row>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            {editing
              ? <Textarea rows={4} value={form.notes || ''} onChange={e => setForm(p => ({...p, notes: e.target.value}))} />
              : <p className="text-sm text-slate-600 whitespace-pre-wrap">{patient.notes || 'No notes.'}</p>
            }
          </Section>
        </div>

        {/* Right: Milestone dates + Audit */}
        <div className="xl:col-span-2 space-y-5">
          {/* All 11 dates */}
          <Section title="Milestone Dates">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {MILESTONES.map(m => (
                <Row key={m.key} label={m.label}>{dateF(m.key)}</Row>
              ))}
            </div>
          </Section>

          {/* Audit Log */}
          <Section title="Activity Log">
            {auditLog.length === 0
              ? <p className="text-sm text-slate-400">No activity recorded yet.</p>
              : <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {auditLog.map(log => (
                    <div key={log._id} className="flex items-start justify-between text-sm border-b border-slate-50 pb-2">
                      <div>
                        <span className="font-medium text-slate-700">{log.userName}</span>
                        <span className="text-slate-500"> — {log.action}</span>
                        {log.changedFields && log.changedFields.length > 0 && (
                          <div className="mt-0.5 space-y-0.5">
                            {log.changedFields.slice(0,3).map((c, i) => (
                              <div key={i} className="text-xs text-slate-400">
                                <span className="font-medium">{c.field}</span>: {String(c.oldValue ?? '—')} → {String(c.newValue ?? '—')}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap ml-3">{timeAgo(log.timestamp)}</span>
                    </div>
                  ))}
                </div>
            }
          </Section>
        </div>
      </div>

      <ConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete}
        title="Delete Patient" message={`Permanently delete ${patient.name}? This cannot be undone.`} loading={saving} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-2 border-b border-slate-100">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs font-medium text-slate-500 w-32 flex-shrink-0">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}
