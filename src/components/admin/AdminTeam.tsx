import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  listStoreAdmins,
  setStoreAdminActive,
  upsertStoreAdmin,
  type StoreAdmin,
  type StoreAdminRole,
} from "../../data/admin";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import ConfirmAction from "./ConfirmAction";

export default function AdminTeam() {
  const [invites, setInvites] = useState<
    { email: string; role: string; expires_at: string }[]
  >([]);
  const [mode, setMode] = useState<"invite" | "existing">("invite");
  const [admins, setAdmins] = useState<StoreAdmin[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StoreAdminRole>("admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      setAdmins(await listStoreAdmins());
      const { data, error } = await supabaseAdmin.rpc("admin_list_invitations");
      if (error) throw error;
      setInvites(data ?? []);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the admin team.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "existing") await upsertStoreAdmin(email, role);
      else {
        const { error } = await supabaseAdmin.functions.invoke("admin-invite", {
          body: { email: email.trim(), role },
        });
        if (error)
          throw Error(
            "Could not send invitation. Check existing members, pending invitations and email delivery.",
          );
      }
      setEmail("");
      setNotice(
        mode === "invite"
          ? "Invitation sent. Your teammate sets their own password and authenticator."
          : "Access saved.",
      );
      await loadAdmins();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save admin access.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (admin: StoreAdmin) => {
    setError(null);
    setNotice(null);
    try {
      await setStoreAdminActive(admin.user_id, !admin.is_active);
      setNotice(
        `${admin.email} ${admin.is_active ? "deactivated" : "activated"}.`,
      );
      await loadAdmins();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update admin access.",
      );
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="font-display text-xl tracking-wide text-foreground">
          Admin team
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite a teammate to use their own account and authenticator. Staff
          can read inventory only. Only owners manage access.
        </p>
      </header>

      <label className="block">
        Action
        <select
          className="ml-3 rounded border bg-surface p-2"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as typeof mode);
            setRole("admin");
          }}
        >
          <option value="invite">Invite new teammate</option>
          <option value="existing">Update existing verified account</option>
        </select>
      </label>
      <form
        onSubmit={submit}
        className="glass grid gap-4 rounded-2xl p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end"
      >
        <label className="text-xs text-muted-foreground">
          User email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            placeholder="teammate@example.com"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Access level
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as StoreAdminRole)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="admin">Administrator</option>
            <option value="staff">Staff  /  inventory read only</option>
            {mode === "existing" && (
              <option value="owner">Owner  /  full access</option>
            )}
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-4 py-2 text-sm"
        >
          {saving ? "Saving…" : "Grant access"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-primary sm:col-span-3">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-green-400 sm:col-span-3">
            {notice}
          </p>
        )}
      </form>

      <div className="space-y-3">
        {invites.map((invite) => (
          <article key={invite.email} className="glass rounded-xl p-4">
            <p className="break-all">
              {invite.email}  /  {invite.role}
            </p>
            <p>
              Invitation expires {new Date(invite.expires_at).toLocaleString()}
            </p>
            <button
              className="btn-outline"
              onClick={async () => {
                const { error } = await supabaseAdmin.rpc(
                  "admin_cancel_invitation",
                  { p_email: invite.email },
                );
                if (error) setError("Could not cancel invitation.");
                else await loadAdmins();
              }}
            >
              Cancel invitation
            </button>
          </article>
        ))}
      </div>
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading team…</p>
        ) : (
          admins.map((admin) => (
            <article
              key={admin.user_id}
              className="glass flex flex-wrap items-center justify-between gap-4 rounded-xl p-4"
            >
              <div className="min-w-0">
                <p className="break-all font-medium text-foreground">
                  {admin.email}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {admin.role} · {admin.is_active ? "Active" : "Inactive"} ·
                  Added {new Date(admin.created_at).toLocaleDateString()}
                </p>
              </div>
              {admin.is_active ? (
                <ConfirmAction
                  label="Deactivate"
                  confirmLabel="Remove access?"
                  onConfirm={() => void toggleActive(admin)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => void toggleActive(admin)}
                  className="btn-outline text-xs"
                >
                  Reactivate
                </button>
              )}
            </article>
          ))
        )}
        {!loading && admins.length === 0 && (
          <p className="text-sm text-muted-foreground">No admins found.</p>
        )}
      </div>
    </section>
  );
}
