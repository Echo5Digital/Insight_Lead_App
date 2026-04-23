'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtDate, timeAgo, cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Field, Select, Input, Textarea } from '@/components/ui/FormField';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, RefreshCw, UserPlus, Trash2, Edit2 } from 'lucide-react';
import type { Lead, Settings } from '@/types';

const LEAD_STATUSES = ['New','Contacted','Forms Sent','No Response','Converted','Not Moving Forward'];

export default function LeadsPage() {
  const router     = useRouter();
  const { user }   = useAuth();
  const isAdmin    = user?.role === 'admin';
  const canWrite   = user?.role === 'admin' || user?.role === 'staff';

  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Filters
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [source,   setSource]   = useState('');

  // Modals
  const [editLead,    setEditLead]    = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [deleteLead,  setDeleteLead]  = useState<Lead | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  // Convert form
  const [convertData, setConvertData] = useState({ insurance: '', referralSource: '', category: 'Standard', notes: '' });
  // Edit form
  const [editData,    setEditData]    = useState<Partial<Lead>>({});
  // Create form
  const [createData,  setCreateData]  = useState({ name:'', email:'', phone:'', insurance:'', referralSource:'', notes:'', status:'New' });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (source) params.set('referralSource', source);
      const data = await api.get<{ leads: Lead[]; total: number; pages: number }>(`/leads?${params}`);
      setLeads(data.leads); setTotal(data.total); setPages(data.pages);
    } catch { toast.error('Failed to load leads'); }
    finally { setLoading(false); }
  }, [page, search, status, source]);

  useEffect(() => { api.get<Settings>('/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  const rowColor = (lead: Lead) => {
    if (lead.convertedToPatient) return '';
    const d = daysSince(lead.createdAt);
    if (d >= 14) return 'bg-red-50 hover:bg-red-100';
    if (d >= 7)  return 'bg-amber-50 hover:bg-amber-100';
    return 'hover:bg-slate-50';
  };

  const handleEdit = async () => {
    if (!editLead) return;
    setSaving(true);
    try {
      await api.put(`/leads/${editLead._id}`, editData);
      toast.success('Lead updated'); setEditLead(null); loadLeads();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  const handleConvert = async () => {
    if (!convertLead) return;
    setSaving(true);
    try {
      const res = await api.post<{ patientId: string }>(`/leads/${convertLead._id}/convert`, convertData);
      toast.success('Converted to patient!'); setConvertLead(null); loadLeads();
      router.push(`/patients/${res.patientId}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteLead) return;
    setSaving(true);
    try {
      await api.delete(`/leads/${deleteLead._id}`);
      toast.success('Lead deleted'); setDeleteLead(null); loadLeads();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/leads', createData);
      toast.success('Lead created'); setShowCreate(false);
      setCreateData({ name:'', email:'', phone:'', insurance:'', referralSource:'', notes:'', status:'New' });
      loadLeads();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  const handleInlineStatus = async (lead: Lead, newStatus: string) => {
    try {
      await api.put(`/leads/${lead._id}`, { status: newStatus });
      setLeads(prev => prev.map(l => l._id === lead._id ? { ...l, status: newStatus } : l));
      toast.success('Status updated');
    } catch { toast.error('Failed to update status'); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total leads</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Lead
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input-base pl-8 text-sm" placeholder="Search name, email, phone…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input-base w-40 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-base w-44 text-sm" value={source} onChange={e => { setSource(e.target.value); setPage(1); }}>
          <option value="">All sources</option>
          {(settings?.referralSourceList || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={loadLeads} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-100 border border-amber-200 rounded" /> No contact 7+ days</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-200 rounded" /> No contact 14+ days</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Insurance</th>
                  <th className="table-th">Source</th>
                  <th className="table-th">Received</th>
                  <th className="table-th">Days Since</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 && (
                  <tr><td colSpan={8} className="table-td text-center py-12 text-slate-400">No leads found</td></tr>
                )}
                {leads.map(lead => (
                  <tr key={lead._id} className={cn('transition-colors', rowColor(lead))}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900">{lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || '—'}</div>
                      <div className="text-xs text-slate-400">{lead.email || ''}</div>
                    </td>
                    <td className="table-td text-slate-600">{lead.phone || '—'}</td>
                    <td className="table-td text-slate-600">{lead.insurance || '—'}</td>
                    <td className="table-td text-slate-600">{lead.referralSource || lead.source || '—'}</td>
                    <td className="table-td text-slate-500 text-xs">{fmtDate(lead.createdAt)}</td>
                    <td className="table-td text-slate-600">{daysSince(lead.createdAt)}d</td>
                    <td className="table-td">
                      {canWrite
                        ? <select value={lead.status || 'New'}
                            onChange={e => handleInlineStatus(lead, e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-brand bg-white">
                            {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        : <StatusBadge status={lead.status || 'New'} />
                      }
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        {canWrite && !lead.convertedToPatient && (
                          <>
                            <button onClick={() => { setEditLead(lead); setEditData({ name: lead.name, email: lead.email, phone: lead.phone, insurance: lead.insurance, referralSource: lead.referralSource, notes: lead.notes }); }}
                              className="p-1.5 text-slate-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors" title="Edit">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => { setConvertLead(lead); setConvertData({ insurance: lead.insurance || '', referralSource: lead.referralSource || '', category: 'Standard', notes: '' }); }}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Convert to patient">
                              <UserPlus size={13} />
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button onClick={() => setDeleteLead(lead)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                        {lead.convertedToPatient && (
                          <button onClick={() => router.push(`/patients/${lead.patientId}`)}
                            className="text-xs text-brand hover:underline">View Patient</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} limit={25} onChange={setPage} />
      </div>

      {/* Edit Modal */}
      <Modal open={!!editLead} onClose={() => setEditLead(null)} title="Edit Lead" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name"><Input value={editData.name || ''} onChange={e => setEditData(p => ({...p, name: e.target.value}))} /></Field>
            <Field label="Email"><Input type="email" value={editData.email || ''} onChange={e => setEditData(p => ({...p, email: e.target.value}))} /></Field>
            <Field label="Phone"><Input value={editData.phone || ''} onChange={e => setEditData(p => ({...p, phone: e.target.value}))} /></Field>
            <Field label="Insurance"><Select options={settings?.insuranceList || []} placeholder="Select…" value={editData.insurance || ''} onChange={e => setEditData(p => ({...p, insurance: e.target.value}))} /></Field>
            <Field label="Referral Source" className="col-span-2"><Select options={settings?.referralSourceList || []} placeholder="Select…" value={editData.referralSource || ''} onChange={e => setEditData(p => ({...p, referralSource: e.target.value}))} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={3} value={editData.notes || ''} onChange={e => setEditData(p => ({...p, notes: e.target.value}))} /></Field>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setEditLead(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleEdit} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </Modal>

      {/* Convert Modal */}
      <Modal open={!!convertLead} onClose={() => setConvertLead(null)} title="Convert to Patient" size="md">
        <p className="text-sm text-slate-500 mb-4">Converting <strong>{convertLead?.name}</strong> to a patient record.</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Insurance"><Select options={settings?.insuranceList || []} placeholder="Select…" value={convertData.insurance} onChange={e => setConvertData(p => ({...p, insurance: e.target.value}))} /></Field>
            <Field label="Category"><Select options={['Standard','Pain Management']} value={convertData.category} onChange={e => setConvertData(p => ({...p, category: e.target.value}))} /></Field>
            <Field label="Referral Source" className="col-span-2"><Select options={settings?.referralSourceList || []} placeholder="Select…" value={convertData.referralSource} onChange={e => setConvertData(p => ({...p, referralSource: e.target.value}))} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={convertData.notes} onChange={e => setConvertData(p => ({...p, notes: e.target.value}))} /></Field>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setConvertLead(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleConvert} disabled={saving} className="btn-primary flex items-center gap-2">
              <UserPlus size={14} />{saving ? 'Converting…' : 'Convert to Patient'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Lead" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" required><Input value={createData.name} onChange={e => setCreateData(p => ({...p, name: e.target.value}))} /></Field>
            <Field label="Email"><Input type="email" value={createData.email} onChange={e => setCreateData(p => ({...p, email: e.target.value}))} /></Field>
            <Field label="Phone"><Input value={createData.phone} onChange={e => setCreateData(p => ({...p, phone: e.target.value}))} /></Field>
            <Field label="Insurance"><Select options={settings?.insuranceList || []} placeholder="Select…" value={createData.insurance} onChange={e => setCreateData(p => ({...p, insurance: e.target.value}))} /></Field>
            <Field label="Referral Source" className="col-span-2"><Select options={settings?.referralSourceList || []} placeholder="Select…" value={createData.referralSource} onChange={e => setCreateData(p => ({...p, referralSource: e.target.value}))} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={createData.notes} onChange={e => setCreateData(p => ({...p, notes: e.target.value}))} /></Field>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving || !createData.name} className="btn-primary">{saving ? 'Creating…' : 'Create Lead'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal open={!!deleteLead} onClose={() => setDeleteLead(null)} onConfirm={handleDelete}
        title="Delete Lead" message={`Delete lead for ${deleteLead?.name}? This cannot be undone.`} loading={saving} />
    </div>
  );
}
