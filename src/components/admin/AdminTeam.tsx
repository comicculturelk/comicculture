import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listStoreAdmins, setStoreAdminActive, upsertStoreAdmin, type StoreAdmin, type StoreAdminRole } from '../../data/admin';
import ConfirmAction from './ConfirmAction';

export default function AdminTeam() {
  const [admins, setAdmins] = useState<StoreAdmin[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StoreAdminRole>('admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      setAdmins(await listStoreAdmins());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the admin team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAdmins(); }, [loadAdmins]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await upsertStoreAdmin(email, role);
      setEmail('');
      setNotice('Admin access saved.');
      await loadAdmins();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save admin access.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (admin: StoreAdmin) => {
    setError(null);
    setNotice(null);
    try {
      await setStoreAdminActive(admin.user_id, !admin.is_active);
      setNotice(`${admin.email} ${admin.is_active ? 'deactivated' : 'activated'}.`);
      await loadAdmins();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update admin access.');
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="font-display text-xl tracking-wide text-foreground">ADMIN TEAM</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add an existing Supabase Auth user as an owner or administrator. Owners can manage team access.</p>
      </header>

      <form onSubmit={submit} className="glass grid gap-4 rounded-2xl p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <label className="text-xs text-muted-foreground">
          User email
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" placeholder="teammate@example.com" />
        </label>
        <label className="text-xs text-muted-foreground">
          Access level
          <select value={role} onChange={(event) => setRole(event.target.value as StoreAdminRole)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="admin">Administrator</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'Saving…' : 'Grant access'}</button>
        {error && <p role="alert" className="text-sm text-primary sm:col-span-3">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-400 sm:col-span-3">{notice}</p>}
      </form>

      <div className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading team…</p> : admins.map((admin) => (
          <article key={admin.user_id} className="glass flex flex-wrap items-center justify-between gap-4 rounded-xl p-4">
            <div className="min-w-0">
              <p className="break-all font-medium text-foreground">{admin.email}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">{admin.role} · {admin.is_active ? 'Active' : 'Inactive'} · Added {new Date(admin.created_at).toLocaleDateString()}</p>
            </div>
            {admin.is_active ? (
              <ConfirmAction label="Deactivate" confirmLabel="Remove access?" onConfirm={() => void toggleActive(admin)} />
            ) : (
              <button type="button" onClick={() => void toggleActive(admin)} className="btn-outline text-xs">Reactivate</button>
            )}
          </article>
        ))}
        {!loading && admins.length === 0 && <p className="text-sm text-muted-foreground">No admins found.</p>}
      </div>
    </section>
  );
}
