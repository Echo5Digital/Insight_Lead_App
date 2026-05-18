'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtDate, fmtDateShort, toInputDate, cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, Download, Trash2, SlidersHorizontal } from 'lucide-react';
import type { Patient, Settings } from '@/types';

const COLUMNS = [
  { key: 'insurance',    label: 'Insurance' },
  { key: 'source',       label: 'Source' },
  { key: 'forms',        label: 'Forms' },
  { key: 'preauth',      label: 'Pre-Auth' },
  { key: 'gfe',          label: 'GFE' },
  { key: 'intakeAppt',   label: 'Intake Appt' },
  { key: 'testAppt',     label: 'Test Appt' },
  { key: 'feedbackAppt', label: 'Feedback Appt' },
  { key: 'balance',      label: 'Balance' },
  { key: 'notes',        label: 'Notes' },
] as const;
type ColKey = typeof COLUMNS[number]['key'];
const ALL_COLS = new Set<ColKey>(COLUMNS.map(c => c.key));
const LS_KEY   = 'patients_visible_cols';

type EditableField = 'intakeAppt'|'testAppt'|'feedbackAppt'|'formsSent'|'formsRec'|'preAuthSent'|'preAuthRec'|'gfeSent'|'gfeRec';

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

function PatientsInner() {
  const { user }     = useAuth();
  const isAdmin      = user?.role === 'admin';
  const canWrite     = user?.role === 'admin' || user?.role === 'staff';
  const searchParams = useSearchParams();

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
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(ALL_COLS);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [editingDate, setEditingDate] = useState<{ id: string; field: EditableField } | null>(null);

  // Filters — pre-filled from URL query params when navigating from dashboard/referrals
  const [search,    setSearch]    = useState(() => searchParams.get('search')         || '');
  const [status,    setStatus]    = useState(() => searchParams.get('status')         || '');
  const [insurance, setInsurance] = useState(() => searchParams.get('insurance')      || '');
  const [category,  setCategory]  = useState(() => searchParams.get('category')       || '');
  const [source,    setSource]    = useState(() => searchParams.get('referralSource') || '');
  const [dateFrom,  setDateFrom]  = useState(() => searchParams.get('dateFrom')       || '');
  const [dateTo,    setDateTo]    = useState(() => searchParams.get('dateTo')         || '');
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
      if (dateFrom)  params.set('dateFrom',       dateFrom);
      if (dateTo)    params.set('dateTo',         dateTo);
      if (needsName) params.set('needsName',      'true');
      const data = await api.get<{ patients: Patient[]; total: number; pages: number }>(`/patients?${params}`);
      setPatients(data.patients); setTotal(data.total); setPages(data.pages);
    } catch { toast.error('Failed to load patients'); }
    finally { setLoading(false); }
  }, [page, search, status, insurance, category, source, dateFrom, dateTo, needsName, sortBy, sortDir]);

  useEffect(() => { api.get<Settings>('/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => { loadPatients(); }, [loadPatients]);

  // Load saved column visibility from localStorage (client only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setVisibleCols(new Set(JSON.parse(saved) as ColKey[]));
    } catch { /* ignore */ }
  }, []);

  // Click-outside to close column menu
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const col = (key: ColKey) => visibleCols.has(key);

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

  const handleInlineDate = async (p: Patient, field: EditableField, value: string) => {
    const newVal = value || null;
    setEditingDate(null);
    setPatients(prev => prev.map(x => x._id === p._id ? { ...x, [field]: newVal } : x));
    try {
      await api.put(`/patients/${p._id}`, { [field]: newVal });
    } catch {
      toast.error('Update failed');
      setPatients(prev => prev.map(x => x._id === p._id ? { ...x, [field]: (p as unknown as Record<string,unknown>)[field] } : x));
    }
  };

  const Th = ({ field, label }: { field: string; label: string }) => (
    <th className={cn('table-th cursor-pointer select-none hover:bg-slate-100 transition-colors', sortBy === field ? 'text-brand' : '')}
      onClick={() => toggleSort(field)}>
      {label}{sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );


  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total patients</p>
        </div>
        <div className="flex gap-2">
          {/* Column visibility dropdown */}
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setColMenuOpen(o => !o)}
              className="btn-secondary flex items-center gap-2 text-sm">
              <SlidersHorizontal size={14} /> Columns
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-48">
                <p className="text-xs font-semibold text-slate-500 mb-2 px-1">Show / Hide Columns</p>
                {COLUMNS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)}
                      className="rounded text-brand" />
                    <span className="text-sm text-slate-700">{c.label}</span>
                  </label>
                ))}
                <button onClick={() => {
                  setVisibleCols(ALL_COLS);
                  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(ALL_COLS)));
                }} className="mt-2 text-xs text-brand hover:underline w-full text-left px-1">
                  Reset all
                </button>
              </div>
            )}
          </div>
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="overflow-x-auto">
        {loading ? <PageSpinner /> : (
          <table className="min-w-[1100px] w-full">
              <thead>
                <tr>
                  {isAdmin && <th className="table-th w-8 sticky left-0 z-20 bg-white"><input type="checkbox" checked={selected.size === patients.length && patients.length > 0} onChange={toggleAll} className="rounded" /></th>}
                  <th className={cn('table-th cursor-pointer select-none hover:bg-slate-100 transition-colors sticky z-20 bg-white', isAdmin ? 'left-8' : 'left-0', sortBy === 'name' ? 'text-brand' : '')} onClick={() => toggleSort('name')}>
                    Name{sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  {col('insurance')    && <th className="table-th">Insurance</th>}
                  {col('source')       && <th className="table-th">Source</th>}
                  <Th field="status"     label="Status" />
                  {col('forms')        && <th className="table-th">Forms</th>}
                  {col('preauth')      && <th className="table-th">Pre-Auth</th>}
                  {col('gfe')          && <th className="table-th">GFE</th>}
                  {col('intakeAppt')   && <Th field="intakeAppt"   label="Intake Appt" />}
                  {col('testAppt')     && <Th field="testAppt"     label="Test Appt" />}
                  {col('feedbackAppt') && <Th field="feedbackAppt" label="Feedback Appt" />}
                  {col('balance')      && <th className="table-th">Balance</th>}
                  {col('notes')        && <th className="table-th">Notes</th>}
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 && (
                  <tr><td colSpan={(isAdmin ? 2 : 1) + 1 + visibleCols.size} className="table-td text-center py-12 text-slate-400">No patients found</td></tr>
                )}
                {patients.map(p => (
                  <tr key={p._id} className={cn('table-tr border-l-4 border-transparent', rowBg(p.status))}>
                    {isAdmin && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggleSelect(p._id)} className="rounded" />
                      </td>
                    )}
                    <td className={cn('table-td sticky z-10', isAdmin ? 'left-8' : 'left-0', rowBg(p.status) || 'bg-white')} onClick={() => window.location.href = `/patients/${p._id}`}>
                      <div className="flex items-center gap-2">
                        {p.needsName
                          ? <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-semibold whitespace-nowrap cursor-pointer">
                              ⚠ Add name
                            </span>
                          : <span className="font-medium text-slate-900 hover:text-brand cursor-pointer">{p.name || '—'}</span>
                        }
                      </div>
                      <div className="text-xs text-slate-400">{p.email || p.insurance || ''}</div>
                    </td>
                    {col('insurance')    && <td className="table-td text-slate-600 text-xs">{p.insurance || '—'}</td>}
                    {col('source')       && <td className="table-td text-slate-600 text-xs">{p.referralSource || '—'}</td>}
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      {canWrite
                        ? <select value={p.status || ''} onChange={e => handleInlineStatus(p, e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-brand bg-transparent">
                            {(settings?.statusList || []).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        : <StatusBadge status={p.status || ''} />
                      }
                    </td>
                    {col('forms') && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5">
                          <DateCell p={p} field="formsSent"  label="Sent" canWrite={canWrite} editing={editingDate} setEditing={setEditingDate} onSave={handleInlineDate} />
                          <DateCell p={p} field="formsRec"   label="Rec"  canWrite={canWrite} editing={editingDate} setEditing={setEditingDate} onSave={handleInlineDate} />
                        </div>
                      </td>
                    )}
                    {col('preauth') && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5">
                          <DateCell p={p} field="preAuthSent" label="Sent" canWrite={canWrite} editing={editingDate} setEditing={setEditingDate} onSave={handleInlineDate} />
                          <DateCell p={p} field="preAuthRec"  label="Rec"  canWrite={canWrite} editing={editingDate} setEditing={setEditingDate} onSave={handleInlineDate} />
                        </div>
                      </td>
                    )}
                    {col('gfe') && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5">
                          <DateCell p={p} field="gfeSent" label="Sent" canWrite={canWrite} editing={editingDate} setEditing={setEditingDate} onSave={handleInlineDate} />
                          <DateCell p={p} field="gfeRec"  label="Rec"  canWrite={canWrite} editing={editingDate} setEditing={setEditingDate} onSave={handleInlineDate} />
                        </div>
                      </td>
                    )}
                    {col('intakeAppt') && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        {canWrite && editingDate?.id === p._id && editingDate.field === 'intakeAppt'
                          ? <input autoFocus type="date" className="text-xs border border-brand rounded-lg px-2 py-1 outline-none bg-white w-32"
                              value={toInputDate(p.intakeAppt)}
                              onChange={e => handleInlineDate(p, 'intakeAppt', e.target.value)}
                              onBlur={() => setEditingDate(null)}
                              onKeyDown={e => e.key === 'Escape' && setEditingDate(null)} />
                          : <button onClick={() => canWrite && setEditingDate({ id: p._id, field: 'intakeAppt' })}
                              className={cn('text-xs px-2 py-1 rounded-lg transition-colors text-left w-full',
                                canWrite ? 'hover:bg-blue-50 hover:text-brand cursor-pointer' : 'cursor-default',
                                p.intakeAppt ? 'text-slate-700 font-medium' : 'text-slate-400')}>
                              {p.intakeAppt ? fmtDateShort(p.intakeAppt) : (canWrite ? '+ Add date' : '—')}
                            </button>
                        }
                      </td>
                    )}
                    {col('testAppt') && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        {canWrite && editingDate?.id === p._id && editingDate.field === 'testAppt'
                          ? <input autoFocus type="date" className="text-xs border border-brand rounded-lg px-2 py-1 outline-none bg-white w-32"
                              value={toInputDate(p.testAppt)}
                              onChange={e => handleInlineDate(p, 'testAppt', e.target.value)}
                              onBlur={() => setEditingDate(null)}
                              onKeyDown={e => e.key === 'Escape' && setEditingDate(null)} />
                          : <button onClick={() => canWrite && setEditingDate({ id: p._id, field: 'testAppt' })}
                              className={cn('text-xs px-2 py-1 rounded-lg transition-colors text-left w-full',
                                canWrite ? 'hover:bg-blue-50 hover:text-brand cursor-pointer' : 'cursor-default',
                                p.testAppt ? 'text-slate-700 font-medium' : 'text-slate-400')}>
                              {p.testAppt ? fmtDateShort(p.testAppt) : (canWrite ? '+ Add date' : '—')}
                            </button>
                        }
                      </td>
                    )}
                    {col('feedbackAppt') && (
                      <td className="table-td" onClick={e => e.stopPropagation()}>
                        {canWrite && editingDate?.id === p._id && editingDate.field === 'feedbackAppt'
                          ? <input autoFocus type="date" className="text-xs border border-brand rounded-lg px-2 py-1 outline-none bg-white w-32"
                              value={toInputDate(p.feedbackAppt)}
                              onChange={e => handleInlineDate(p, 'feedbackAppt', e.target.value)}
                              onBlur={() => setEditingDate(null)}
                              onKeyDown={e => e.key === 'Escape' && setEditingDate(null)} />
                          : <button onClick={() => canWrite && setEditingDate({ id: p._id, field: 'feedbackAppt' })}
                              className={cn('text-xs px-2 py-1 rounded-lg transition-colors text-left w-full',
                                canWrite ? 'hover:bg-blue-50 hover:text-brand cursor-pointer' : 'cursor-default',
                                p.feedbackAppt ? 'text-slate-700 font-medium' : 'text-slate-400')}>
                              {p.feedbackAppt ? fmtDateShort(p.feedbackAppt) : (canWrite ? '+ Add date' : '—')}
                            </button>
                        }
                      </td>
                    )}
                    {col('balance') && <td className="table-td text-xs text-slate-700">{p.balance != null ? `$${p.balance}` : '—'}</td>}
                    {col('notes')   && <td className="table-td text-xs text-slate-500 max-w-[140px] truncate">{p.notes || ''}</td>}
                  </tr>
                ))}
              </tbody>
          </table>
        )}
        </div>
        <Pagination page={page} pages={pages} total={total} limit={25} onChange={setPage} />
      </div>

      <ConfirmModal open={bulkModal} onClose={() => setBulkModal(false)} onConfirm={handleBulkDelete}
        title="Bulk Delete Patients" message={`Permanently delete ${selected.size} patients? This cannot be undone.`}
        confirmLabel={`Delete ${selected.size} Patients`} loading={saving} />
    </div>
  );
}

function DateCell({ p, field, label, canWrite, editing, setEditing, onSave }: {
  p: Patient;
  field: EditableField;
  label: string;
  canWrite: boolean;
  editing: { id: string; field: EditableField } | null;
  setEditing: (v: { id: string; field: EditableField } | null) => void;
  onSave: (p: Patient, field: EditableField, value: string) => void;
}) {
  const val = (p as unknown as Record<string, string | undefined>)[field];
  const isEditing = editing?.id === p._id && editing.field === field;

  if (isEditing) {
    return (
      <input autoFocus type="date"
        className="text-xs border border-brand rounded px-1.5 py-0.5 outline-none bg-white w-28"
        value={toInputDate(val)}
        onChange={e => onSave(p, field, e.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={e => e.key === 'Escape' && setEditing(null)} />
    );
  }
  return (
    <button
      onClick={() => canWrite && setEditing({ id: p._id, field })}
      className={cn('flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors w-full text-left',
        canWrite ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default',
        val ? 'text-slate-700' : 'text-slate-300')}>
      <span className={cn('font-semibold w-6 flex-shrink-0', val ? 'text-emerald-600' : 'text-slate-300')}>{label}</span>
      {val ? fmtDateShort(val) : (canWrite ? '+ set' : '—')}
    </button>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="p-6"><PageSpinner /></div>}>
      <PatientsInner />
    </Suspense>
  );
}
