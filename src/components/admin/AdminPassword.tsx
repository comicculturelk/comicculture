import { useState, type FormEvent } from "react";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
export default function AdminPassword({
  invite = false,
}: {
  invite?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (password !== confirm) throw Error("Passwords must match.");
      const { data, error: sessionError } = await supabaseAdmin.auth.getUser();
      if (sessionError || !data.user?.email_confirmed_at)
        throw Error(
          "This link is unavailable or expired. Request a new email.",
        );
      const { error: updateError } = await supabaseAdmin.auth.updateUser({
        password,
      });
      if (updateError)
        throw Error(
          "Could not save password. Check password requirements or request a new link.",
        );
      if (invite) {
        const { error: acceptError } = await supabaseAdmin.rpc(
          "accept_admin_invitation",
        );
        if (acceptError)
          throw Error(
            "Password saved, but the invitation is unavailable. Ask the owner to check access.",
          );
      }
      const { error: signOutError } = await supabaseAdmin.auth.signOut({ scope: "global" });
      if (signOutError) throw Error("Password saved. Sign out and sign in again to continue.");
      window.location.replace("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save password.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      className="glass mx-auto my-12 w-full max-w-md space-y-4 rounded-2xl p-6"
    >
      <h1 className="font-display text-3xl">
        {invite ? "Activate your account" : "Set a new password"}
      </h1>
      <p>
        Use your own unique password, at least 12 characters. You will sign in
        and verify your own authenticator next.
      </p>
      <label className="block">
        New password
        <input
          className="mt-1 w-full rounded border bg-surface p-3"
          type="password"
          minLength={12}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="block">
        Confirm password
        <input
          className="mt-1 w-full rounded border bg-surface p-3"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
