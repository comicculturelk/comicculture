import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

export default function AdminMfaGate({ accessToken, children }: { accessToken: string; children: ReactNode }) {
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setVerified(false); setChecking(true);
    Promise.all([supabaseAdmin.auth.mfa.getAuthenticatorAssuranceLevel(), supabaseAdmin.auth.mfa.listFactors()])
      .then(([level, factors]) => {
        if (cancelled) return;
        if (level.error || factors.error) throw new Error('MFA check failed');
        setVerified(level.data.currentLevel === 'aal2');
        setFactorId(factors.data.totp.find(factor => factor.status === 'verified')?.id ?? null);
        setError(null);
      }).catch(() => { if (!cancelled) setError('Could not check two-step verification. Please retry.'); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [accessToken, retry]);

  const enroll = async () => {
    setBusy(true); setError(null);
    try {
      const { data: factors, error: listError } = await supabaseAdmin.auth.mfa.listFactors();
      if (listError) throw listError;
      // An interrupted setup has no usable QR after reload. Replace only unverified factors.
      for (const factor of factors.all.filter(item => item.factor_type === 'totp' && item.status === 'unverified')) {
        const { error: removeError } = await supabaseAdmin.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }
      const { data, error: enrollError } = await supabaseAdmin.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ComicCulture admin', issuer: 'ComicCulture' });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setEnrollment({ qr: data.totp.qr_code, secret: data.totp.secret });
    } catch { setError('Could not start authenticator setup. Please try again.'); }
    finally { setBusy(false); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!factorId || busy) return;
    setBusy(true); setError(null);
    try {
      const { error: verificationError } = await supabaseAdmin.auth.mfa.challengeAndVerify({ factorId, code });
      if (verificationError) throw verificationError;
      setEnrollment(null); setCode(''); setVerified(true);
    } catch { setError('Code was not accepted. Check the code and your phone’s time, then retry.'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true);
    try {
      const { error: signOutError } = await supabaseAdmin.auth.signOut();
      if (signOutError) throw signOutError;
    } catch { setError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  };

  if (verified) return children;
  return <section className="admin-comic flex min-h-screen items-center justify-center bg-background px-4 py-8">
    <div className="glass w-full max-w-md space-y-4 rounded-2xl p-6">
      <h1 className="font-display text-3xl">Two-step verification</h1>
      {checking ? <p role="status">Checking your authenticator…</p> : <>
        {!factorId && <>
          <p className="text-sm text-muted-foreground">Protect store access with an authenticator app. Keep a secure backup of your authenticator before continuing.</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void enroll()}>Set up authenticator</button>
        </>}
        {enrollment && <>
          <p className="text-sm">Scan this code in your authenticator app, then enter its six-digit code below.</p>
          <img src={enrollment.qr} alt="Authenticator setup QR code" className="mx-auto h-48 w-48 bg-white p-2" />
          <details className="text-sm"><summary>Enter setup key manually</summary><code className="mt-2 block break-all">{enrollment.secret}</code></details>
        </>}
        {factorId && <form onSubmit={verify} className="space-y-3">
          <label htmlFor="admin-mfa-code" className="block text-sm">Authenticator code</label>
          <input id="admin-mfa-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g,''))} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-lg tracking-widest" />
          <button className="btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
        </form>}
      </>}
      {error && <><p role="alert" className="text-sm text-primary">{error}</p>{!factorId && <button type="button" className="btn-outline" onClick={() => setRetry(value => value+1)}>Retry check</button>}</>}
      <p className="text-xs text-muted-foreground">Lost access? Recover your factor through the store’s Supabase Auth account. Never share a setup key or verification code.</p>
      <button type="button" className="btn-outline" disabled={busy} onClick={() => void signOut()}>Sign out</button>
    </div>
  </section>;
}
