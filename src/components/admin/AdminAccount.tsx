import { useEffect, useState } from "react";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
export default function AdminAccount() {
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string }[]
  >([]);
  const [setup, setSetup] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    const { data, error } = await supabaseAdmin.auth.mfa.listFactors();
    if (error) throw error;
    setFactors(data.totp.filter((f) => f.status === "verified"));
  };
  useEffect(() => {
    void load().catch(() => setMessage("Could not check authenticators."));
  }, []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await load();
    } catch {
      setMessage(
        "Could not complete this action. Verify your session and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="glass max-w-lg space-y-4 rounded-2xl p-6">
      <h2 className="font-display text-2xl">Your account</h2>
      <p>
        Add and verify a replacement authenticator before removing an old one.
        If you lose every factor, contact the owner for identity-checked
        recovery through Supabase; email recovery does not bypass MFA.
      </p>
      <button
        className="btn-outline"
        disabled={busy || !!setup}
        onClick={() =>
          void run(async () => {
            const { data, error } = await supabaseAdmin.auth.mfa.enroll({
              factorType: "totp",
              issuer: "ComicCulture",
              friendlyName: "ComicCulture " + new Date().toISOString(),
            });
            if (error) throw error;
            setSetup({ id: data.id, qr: data.totp.qr_code });
          })
        }
      >
        Add replacement authenticator
      </button>
      {setup && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const { error } = await supabaseAdmin.auth.mfa.challengeAndVerify(
                { factorId: setup.id, code },
              );
              if (error) throw error;
              setSetup(null);
              setCode("");
              setMessage(
                "Replacement verified. You may now remove the old factor.",
              );
            });
          }}
        >
          <img
            src={setup.qr}
            alt="Scan replacement authenticator QR"
            className="h-48 w-48 bg-white p-2"
          />
          <label className="block">
            New authenticator code
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="block w-full rounded border bg-surface p-3"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button className="btn-primary" disabled={busy}>
            Verify replacement
          </button>
        </form>
      )}
      {factors.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-3">
          <span className="break-all">
            {f.friendly_name || "Authenticator"}
          </span>
          <button
            className="btn-outline"
            disabled={busy || factors.length < 2}
            onClick={() =>
              void run(async () => {
                const { error } = await supabaseAdmin.auth.mfa.unenroll({
                  factorId: f.id,
                });
                if (error) throw error;
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <p>You must keep at least one verified authenticator.</p>
      <button
        className="btn-outline"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const { error } = await supabaseAdmin.auth.signOut({
              scope: "global",
            });
            if (error) throw error;
          })
        }
      >
        Sign out all sessions
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
