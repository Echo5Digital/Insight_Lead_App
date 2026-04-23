'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtDateShort } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { PageSpinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Search, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Patient } from '@/types';

export default function PainManagementPage() {
  const router     = useRouter();
  const { user }   = useAuth();
  const isAdmin    = user?.role === 'admin';
  const [patients,     setPatients]     = useState<Patient[]>([]);
  const [total,        setTotal]        = useState(0);
  const [pages,        setPages]        = useState(1);
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', category: 'Pain Management' });
      if (search) params.set('search', search);
      const data = await api.get<{ patients: Patient[]; total: number; pages: number }>(`/patients?${params}`);
      setPatients(data.patients); setTotal(data.total); setPages(data.pages);
    } catch { toast.error('Failed to load patients'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const goToEdit = (id: string) => router.push(`/patients/${id}`);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/patients/${deleteTarget._id}`);
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Pain Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} pain management patient{total !== 1 ? 's' : ''} — click any row to view &amp; edit
          </p>
        </div>
        <Link
          href="/patients/new?category=Pain+Management"
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} /> Add Patient
        </Link>
      </div>

      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-slate-100">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input-base pl-8 text-sm" placeholder="Search patients…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Email</th>
                  <th className="table-th">DOB</th>
                  <th className="table-th">Insurance</th>
                  <th className="table-th">Referral Source</th>
                  <th className="table-th">Referral Date</th>
                  <th className="table-th">Forms Sent</th>
                  <th className="table-th">Forms Rec</th>
                  <th className="table-th">Pre-Auth Sent</th>
                  <th className="table-th">Pre-Auth Rec</th>
                  <th className="table-th">Intake Appt</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 && (
                  <tr>
                    <td colSpan={13} className="table-td text-center py-12 text-slate-400">
                      No pain management patients found
                    </td>
                  </tr>
                )}
                {patients.map(p => (
                  <tr
                    key={p._id}
                    onClick={() => goToEdit(p._id)}
                    className="table-tr cursor-pointer hover:bg-blue-50 transition-colors"
                  >
                    <td className="table-td">
                      <span className="font-medium text-slate-900 group-hover:text-brand">{p.name}</span>
                    </td>
                    <td className="table-td text-xs text-slate-500">{p.email || '—'}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.dob)}</td>
                    <td className="table-td text-xs text-slate-600">{p.insurance || '—'}</td>
                    <td className="table-td text-xs text-slate-600">{p.referralSource || '—'}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.referralDate)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.formsSent)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.formsRec)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.preAuthSent)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.preAuthRec)}</td>
                    <td className="table-td text-xs text-slate-600">{fmtDateShort(p.intakeAppt)}</td>
                    <td className="table-td"><StatusBadge status={p.status || ''} /></td>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => goToEdit(p._id)}
                          className="p-1.5 text-slate-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                          title="Edit patient"
                        >
                          <Pencil size={13} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete patient"
                          >
                            <Trash2 size={13} />
                          </button>
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

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Patient"
        message={`Permanently delete ${deleteTarget?.name}? This cannot be undone.`}
        loading={deleting}
      />
    </div>
  );
}
