'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate, fmtDateShort, cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, Download, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import type { Patient, Settings } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  'complete':          'bg-emerald-50',
  'in progress':       'bg-blue-50',
  'denied':            'bg-red-50',
  'on hold':           'bg-amber-50',
  'not moving forward':'bg-slate-50',
  'no response':       'bg-orange-50',
};

function rowBg(status?: string) {
  return STATUS_COLORS[(status || '').toLowerCase()] || '';
}

export default function PatientsPage() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'admin';
  const canWrite  = user?.role === 'admin' || user?.role === 'staff';

  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [total,     setTotal]     = useState(0);
  const [pages,     setPages]     = useState(1);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [settings,  setSettings]  = useState<Settings | null>(null);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [sortBy,    setSortBy]    = useState('createdAt');
  const [sortDir,   setSortDir]   = useState<'asc'|'desc'>('desc');

  // Filters
  const [search,    setSearch]    = useState('');
  const [status,    setStatus]    = useState('');
  const [insurance, setInsurance] = useState('');
  const [category,  setCategory]  = useState('');
  const [source,    setSource]    = useState('');
  const [needsName, setNeedsName] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', sortBy, sortDir });
      if (search)    params.set('search',         search);
      if (status)    params.set('status',         status);
      if (insurance) params.set('insurance',      insurance);
      if (category)  params.set('category',       category);
      if (source)    params.set('referralSource', source);
      if (needsName) params.set('needsName',      'true');
      const data = await api.get<{ patients: Patient[]; total: number; pages: number }>(`/patients?${params}`);
      setPatients(data.patients); setTotal(data.total); setPages(data.pages);
    } catch { toast.error('Failed to load patients'); }
    finally { setLoading(false); }
  }, [page, search, status, insurance, category, source, needsName, sortBy, sortDir]);

  useEffect(() => { api.get<Settings>('/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => { loadPatients(); }, [loadPatients]);

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
    setPage(1);
  };

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setSelected(prev =>
    prev.size === patients.length ? new Set() : new Set(patients.map(p => p._id))
  );

  const handleBulkDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/patients/bulk', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk delete failed');
      toast.success(`Deleted ${selected.size} patients`);
      setSelected(new Set()); setBulkModal(false); loadPatients();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  const handleExportCsv = () => {
    window.location.href = '/api/patients/export/csv';
  };

  const handleInlineStatus = async (p: Patient, newStatus: string) => {
    try {
      await api.put(`/patients/${p._id}`, { status: newStatus });
      setPatients(prev => prev.map(x => x._id === p._id ? { ...x, status: newStatus } : x));
      toast.success('Status updated');
    } catch { toast.error('Update failed'); }
  };

  const Th = ({ field, label }: { field: string; label: string }) => (
    <th className={cn('table-th cursor-pointer select-none hover:bg-slate-100 transition-colors', sortBy === field ? 'text-brand' : '')}
      onClick={() => toggleSort(field)}>
      {label}{sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const Check = ({ val }: { val?: string | null }) =>
    val ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-slate-300" />;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total patients</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={handleExportCsv} className="btn-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> Export CSV
            </button>
          )}
          {canWrite && (
            <Link href="/patients/new" className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={14} /> Add Patient
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-slate-100 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input-base pl-8 text-sm" placeholder="Search name, email, phone…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input-base w-40 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {(settings?.statusList || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-base w-40 text-sm" value={insurance} onChange={e => { setInsurance(e.target.value); setPage(1); }}>
          <option value="">All insurance</option>
          {(settings?.insuranceList || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-base w-40 text-sm" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          <option value="Standard">Standard</option>
          <option value="Pain Management">Pain Management</option>
        </select>
        <select className="input-base w-44 text-sm" value={needsName ? 'yes' : ''}
          onChange={e => { setNeedsName(e.target.value === 'yes'); setPage(1); }}>
          <option value="">All patients</option>
          <option value="yes">⚠ Needs name only</option>
        </select>
        {isAdmin && selected.size > 0 && (
          <button onClick={() => setBulkModal(true)} className="btn-danger flex items-center gap-1.5 text-sm">
            <Trash2 size={13} /> Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {isAdmin && <th className="table-th w-8"><input type="checkbox" checked={selected.size === patients.length && patients.length > 0} onChange={toggleAll} className="rounded" /></th>}
                  <Th field="name"       label="Name" />
                  <th className="table-th">Insurance</th>
                  <th className="table-th">Source</th>
                  <Th field="status"     label="Status" />
                  <th className="table-th">Forms</th>
                  <th className="table-th">Pre-Auth</th>
                  <th className="table-th">GFE</th>
                  <Th field="intakeAppt" label="Intake Appt" />
                  <Th field="testAppt"   label="Test Appt" />
                  <Th field="feedbackAppt" label="Feedback Appt" />
                  <th className="table-th">Balance</th>
                  <th className="table-th">Notes</th>
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 && (
                  <tr><td colSpan={13} className="table-td text-center py-12 text-slate-400">No patients found</td></tr>
                )}
                {patients.map(p => (
                  <tr key={p._id} className={cn('table-tr border-l-4 border-transparent', rowBg(p.status))}>
                    {isAdmin && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggleSelect(p._id)} className="rounded" />
                      </td>
                    )}
                    <td className="table-td" onClick={() => window.location.href = `/patients/${p._id}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 hover:text-brand cursor-pointer">{p.name || '—'}</span>
                        {p.needsName && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                            ⚠ Needs name
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{p.email || ''}</div>
                    </td>
                    <td className="table-td text-slate-600 text-xs">{p.insurance || '—'}</td>
                    <td className="table-td text-slate-600 text-xs">{p.referralSource || '—'}</td>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      {canWrite
                        ? <select value={p.status || ''} onChange={e => handleInlineStatus(p, e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-brand bg-transparent">
                            {(settings?.statusList || []).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        : <StatusBadge status={p.status || ''} />
                      }
                    </td>
                    <td className="table-td"><div className="flex gap-1"><Check val={p.formsSent} /><Check val={p.formsRec} /></div></td>
                    <td className="table-td"><div className="flex gap-1"><Check val={p.preAuthSent} /><Check val={p.preAuthRec} /></div></td>
                    <td className="table-td"><div className="flex gap-1"><Check val={p.gfeSent} /><Check val={p.gfeRec} /></div></td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.intakeAppt)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.testAppt)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.feedbackAppt)}</td>
                    <td className="table-td text-xs text-slate-700">{p.balance != null ? `$${p.balance}` : '—'}</td>
                    <td className="table-td text-xs text-slate-500 max-w-[140px] truncate">{p.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} limit={25} onChange={setPage} />
      </div>

      <ConfirmModal open={bulkModal} onClose={() => setBulkModal(false)} onConfirm={handleBulkDelete}
        title="Bulk Delete Patients" message={`Permanently delete ${selected.size} patients? This cannot be undone.`}
        confirmLabel={`Delete ${selected.size} Patients`} loading={saving} />
    </div>
  );
}
