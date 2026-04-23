'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { PageSpinner } from '@/components/ui/Spinner';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Field, Select, Input } from '@/components/ui/FormField';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, X, Save, UserPlus } from 'lucide-react';
import type { Settings } from '@/types';

interface AppUser { _id: string; name: string; email: string; role: string; lastLogin: string; active: boolean }

export default function SettingsPage() {
  const router   = useRouter();
  const { user } = useAuth();

  const [settings,    setSettings]    = useState<Settings | null>(null);
  const [users,       setUsers]       = useState<AppUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);

  // Tag editing state
  const [newInsurance,  setNewInsurance]  = useState('');
  const [newReferral,   setNewReferral]   = useState('');
  const [newStatus,     setNewStatus]     = useState('');
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);

  // New user modal
  const [newUserModal, setNewUserModal] = useState(false);
  const [newUser,      setNewUser]      = useState({ name: '', email: '', password: '', role: 'staff' });
  const [savingUser,   setSavingUser]   = useState(false);

  // Deactivate confirm
  const [deactivateUser, setDeactivateUser] = useState<AppUser | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin') { router.push('/dashboard'); return; }
    Promise.all([
      api.get<Settings>('/settings'),
      api.get<{ users: AppUser[] }>('/users'),
    ]).then(([s, u]) => {
      setSettings(s); setLocalSettings(s); setUsers(u.users);
    }).catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [user, router]);

  const handleSaveConfig = async () => {
    if (!localSettings) return;
    setSaving(true);
    try {
      await api.put('/settings', { appointmentDays: localSettings.appointmentDays });
      toast.success('Config saved');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleSaveLists = async () => {
    if (!localSettings) return;
    setSaving(true);
    try {
      await api.put('/settings', {
        statusList:         localSettings.statusList,
        insuranceList:      localSettings.insuranceList,
        referralSourceList: localSettings.referralSourceList,
      });
      toast.success('Saved successfully');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const removeTag = (list: 'insuranceList' | 'referralSourceList' | 'statusList', val: string) => {
    setLocalSettings(s => s ? { ...s, [list]: s[list].filter(v => v !== val) } : s);
  };

  const addTag = (list: 'insuranceList' | 'referralSourceList' | 'statusList', val: string, clear: () => void) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setLocalSettings(s => {
      if (!s || s[list].includes(trimmed)) return s;
      return { ...s, [list]: [...s[list], trimmed].sort() };
    });
    clear();
  };

  const handleUpdateRole = async (u: AppUser, role: string) => {
    try {
      await api.put(`/users/${u._id}`, { role });
      setUsers(prev => prev.map(x => x._id === u._id ? { ...x, role } : x));
      toast.success('Role updated');
    } catch { toast.error('Update failed'); }
  };

  const handleToggleActive = async () => {
    if (!deactivateUser) return;
    try {
      await api.put(`/users/${deactivateUser._id}`, { active: !deactivateUser.active });
      setUsers(prev => prev.map(x => x._id === deactivateUser._id ? { ...x, active: !x.active } : x));
      toast.success(deactivateUser.active ? 'User deactivated' : 'User activated');
      setDeactivateUser(null);
    } catch { toast.error('Update failed'); }
  };

  const handleCreateUser = async () => {
    setSavingUser(true);
    try {
      await api.post('/users', newUser);
      toast.success('User created');
      setNewUserModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'staff' });
      const { users: u } = await api.get<{ users: AppUser[] }>('/users');
      setUsers(u);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSavingUser(false); }
  };

  if (loading) return <div className="p-6"><PageSpinner /></div>;

  const cfg = localSettings?.appointmentDays;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="page-title">Settings</h1>

      {/* Section 1 — Appointment Config */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="section-title mb-4">Appointment Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ['Intake Future Days',          'intake'],
            ['Test Future Days',            'test'],
            ['Feedback Future Days',        'feedback'],
            ['GFE Lookback Days',           'gfeLookback'],
            ['Outstanding Lookback Days',   'outstandingLookback'],
          ].map(([label, key]) => (
            <Field key={key} label={label}>
              <Input type="number" min="1" max="365"
                value={cfg?.[key as keyof typeof cfg] ?? ''}
                onChange={e => setLocalSettings(s => s ? { ...s, appointmentDays: { ...s.appointmentDays, [key]: parseInt(e.target.value) || 0 } } : s)} />
            </Field>
          ))}
        </div>
        <button onClick={handleSaveConfig} disabled={saving} className="btn-primary mt-4 flex items-center gap-2">
          <Save size={14} />{saving ? 'Saving…' : 'Save Config'}
        </button>
      </div>

      {/* Section 2 — Patient Status List */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="section-title mb-1">Patient Status Options</h3>
        <p className="text-sm text-slate-500 mb-4">{localSettings?.statusList.length} options — used in all status dropdowns</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(localSettings?.statusList || []).map(v => (
            <span key={v} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
              {v}
              <button onClick={() => removeTag('statusList', v)} className="text-slate-400 hover:text-red-500 transition-colors ml-1"><X size={12} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input-base flex-1 text-sm" placeholder="Add status option…" value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag('statusList', newStatus, () => setNewStatus(''))} />
          <button onClick={() => addTag('statusList', newStatus, () => setNewStatus(''))} className="btn-secondary px-3"><Plus size={14} /></button>
        </div>
        <button onClick={handleSaveLists} disabled={saving} className="btn-primary mt-3 flex items-center gap-2 text-sm">
          <Save size={13} />Save Lists
        </button>
      </div>

      {/* Section 4 — Insurance List */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="section-title mb-1">Insurance Options</h3>
        <p className="text-sm text-slate-500 mb-4">{localSettings?.insuranceList.length} options</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(localSettings?.insuranceList || []).map(v => (
            <span key={v} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
              {v}
              <button onClick={() => removeTag('insuranceList', v)} className="text-slate-400 hover:text-red-500 transition-colors ml-1"><X size={12} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input-base flex-1 text-sm" placeholder="Add insurance…" value={newInsurance}
            onChange={e => setNewInsurance(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag('insuranceList', newInsurance, () => setNewInsurance(''))} />
          <button onClick={() => addTag('insuranceList', newInsurance, () => setNewInsurance(''))} className="btn-secondary px-3"><Plus size={14} /></button>
        </div>
        <button onClick={handleSaveLists} disabled={saving} className="btn-primary mt-3 flex items-center gap-2 text-sm">
          <Save size={13} />Save Lists
        </button>
      </div>

      {/* Section 3 — Referral Source List */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="section-title mb-1">Referral Source Options</h3>
        <p className="text-sm text-slate-500 mb-4">{localSettings?.referralSourceList.length} options</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(localSettings?.referralSourceList || []).map(v => (
            <span key={v} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
              {v}
              <button onClick={() => removeTag('referralSourceList', v)} className="text-slate-400 hover:text-red-500 transition-colors ml-1"><X size={12} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input-base flex-1 text-sm" placeholder="Add referral source…" value={newReferral}
            onChange={e => setNewReferral(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag('referralSourceList', newReferral, () => setNewReferral(''))} />
          <button onClick={() => addTag('referralSourceList', newReferral, () => setNewReferral(''))} className="btn-secondary px-3"><Plus size={14} /></button>
        </div>
        <button onClick={handleSaveLists} disabled={saving} className="btn-primary mt-3 flex items-center gap-2 text-sm">
          <Save size={13} />Save Lists
        </button>
      </div>

      {/* Section 6 — User Management */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title">User Management</h3>
          <button onClick={() => setNewUserModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus size={14} /> Add User
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Email</th>
                <th className="table-th">Role</th>
                <th className="table-th">Last Login</th>
                <th className="table-th">Status</th>
                <th className="table-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className="hover:bg-slate-50">
                  <td className="table-td font-medium">{u.name}</td>
                  <td className="table-td text-slate-500 text-sm">{u.email}</td>
                  <td className="table-td">
                    <select value={u.role}
                      onChange={e => handleUpdateRole(u, e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-brand bg-white">
                      <option value="admin">admin</option>
                      <option value="staff">staff</option>
                      <option value="readonly">readonly</option>
                    </select>
                  </td>
                  <td className="table-td text-xs text-slate-500">{u.lastLogin ? fmtDate(u.lastLogin) : 'Never'}</td>
                  <td className="table-td">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-td">
                    {u.email !== user?.email && (
                      <button onClick={() => setDeactivateUser(u)}
                        className="text-xs text-slate-500 hover:text-red-600 hover:underline transition-colors">
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal open={newUserModal} onClose={() => setNewUserModal(false)} title="Add New User" size="sm">
        <div className="space-y-4">
          <Field label="Full Name" required><Input value={newUser.name} onChange={e => setNewUser(p => ({...p, name: e.target.value}))} /></Field>
          <Field label="Email" required><Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({...p, email: e.target.value}))} /></Field>
          <Field label="Password" required><Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))} /></Field>
          <Field label="Role"><Select options={['admin','staff','readonly']} value={newUser.role} onChange={e => setNewUser(p => ({...p, role: e.target.value}))} /></Field>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setNewUserModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreateUser} disabled={savingUser || !newUser.name || !newUser.email || !newUser.password}
              className="btn-primary">{savingUser ? 'Creating…' : 'Create User'}</button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmModal open={!!deactivateUser} onClose={() => setDeactivateUser(null)} onConfirm={handleToggleActive}
        title={deactivateUser?.active ? 'Deactivate User' : 'Activate User'}
        message={`${deactivateUser?.active ? 'Deactivate' : 'Activate'} ${deactivateUser?.name}?`}
        confirmLabel={deactivateUser?.active ? 'Deactivate' : 'Activate'} />
    </div>
  );
}
