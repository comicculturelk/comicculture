import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getStoreAdminRole, type StoreAdminRole } from '../data/admin';
import AdminProducts from '../components/admin/AdminProducts';
import AdminCollections from '../components/admin/AdminCollections';
import AdminDashboard from '../components/admin/AdminDashboard';
import AdminHistory from '../components/admin/AdminHistory';
import AdminInventory from '../components/admin/AdminInventory';
import AdminOrders from '../components/admin/AdminOrders';
import AdminPromos from '../components/admin/AdminPromos';
import AdminReviews from '../components/admin/AdminReviews';
import AdminTeam from '../components/admin/AdminTeam';

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminRole, setAdminRole] = useState<StoreAdminRole | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessRetry, setAccessRetry] = useState(0);

  useEffect(() => {
    supabaseAdmin.auth.getSession().then(({ data, error }) => {
      if (error) setAccessError('Could not check your sign-in. Refresh the page and try again.');
      setSession(data.session);
    }).catch(() => {
      setAccessError('Could not check your sign-in. Refresh the page and try again.');
    }).finally(() => setCheckingSession(false));
    const { data: listener } = supabaseAdmin.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAdminRole(null);
      setAccessError(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAdminRole(null);
      setCheckingAdmin(false);
      return;
    }
    let cancelled = false;
    setCheckingAdmin(true);
    setAccessError(null);
    getStoreAdminRole().then((role) => {
      if (!cancelled) setAdminRole(role);
    }).catch(() => {
      if (!cancelled) setAccessError('Could not verify admin access. Retry the check.');
    }).finally(() => {
      if (!cancelled) setCheckingAdmin(false);
    });
    return () => { cancelled = true; };
    }, [session, accessRetry]);

  if (checkingSession) {
    return (
      <section className="comic-page flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted">Loading...</p>
      </section>
    );
  }

  if (!session) return <AdminLogin />;
  if (checkingAdmin) {
    return <section className="comic-page flex min-h-screen items-center justify-center bg-background"><p className="text-muted">Checking admin access…</p></section>;
  }
  if (!adminRole) {
    return (
      <section className="admin-comic comic-page flex min-h-screen items-center justify-center bg-background px-6">
        <div className="glass w-full max-w-lg space-y-4 rounded-2xl p-8">
          <p className="admin-eyebrow">ComicCulture • Back office</p>
          <h1 className="font-display text-3xl text-foreground tracking-wide">Admin access required</h1>
          <p role={accessError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
            {accessError ?? 'This account is not on the ComicCulture admin team.'}
          </p>
          {accessError && <button type="button" onClick={() => setAccessRetry((value) => value + 1)} className="btn-primary">Retry access check</button>}
          <button type="button" onClick={() => void supabaseAdmin.auth.signOut()} className="btn-outline">Sign Out</button>
        </div>
      </section>
    );
  }
  return <AdminPanel role={adminRole} />;
}

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
    } catch {
      setError('Could not sign in. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-comic comic-page flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={handleSubmit} className="glass admin-login-card w-full max-w-sm space-y-4 rounded-2xl p-8">
        <p className="admin-eyebrow">ComicCulture • Back office</p>
        <h1 className="font-display text-3xl text-foreground tracking-wide">Admin sign in</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage your store.</p>
        <input
          type="email"
          required
          autoComplete="username"
          aria-label="Admin email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          aria-label="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-primary">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </section>
  );
}

const ADMIN_VIEWS = ['dashboard', 'orders', 'products', 'collections', 'inventory', 'promos', 'reviews', 'history', 'team'] as const;
type AdminView = typeof ADMIN_VIEWS[number];

function AdminPanel({ role }: { role: StoreAdminRole }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('section');
  const view: AdminView = ADMIN_VIEWS.includes(requestedView as AdminView) && (requestedView !== 'team' || role === 'owner')
    ? requestedView as AdminView
    : 'orders';
  const setView = (next: AdminView) => setSearchParams({ section: next });
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSignOutError(null);
    const { error } = await supabaseAdmin.auth.signOut();
    if (error) setSignOutError('Could not sign out. Please try again.');
  };

  const visibleViews = role === 'owner' ? ADMIN_VIEWS : ADMIN_VIEWS.filter((item) => item !== 'team');

  return (
    <section className="admin-comic comic-page min-h-screen bg-background px-4 py-24 sm:px-6 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <p className="admin-eyebrow">ComicCulture · Store admin</p>
              <h1 className="break-words font-display text-2xl text-foreground tracking-wide sm:text-4xl">Store dashboard</h1>
            </div>
            <nav className="admin-nav flex flex-wrap gap-2" aria-label="Admin sections">
              {visibleViews.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-current={view === v ? 'page' : undefined}
                  className={`admin-tab ${
                    view === v
                      ? 'is-active'
                      : ''
                  }`}
                >
                  {v}
                </button>
              ))}
            </nav>
          </div>
          <button type="button" onClick={handleSignOut} className="btn-outline text-sm">
            Sign Out
          </button>
        </div>

        {signOutError && <p role="alert" className="mb-4 text-sm text-primary">{signOutError}</p>}
        {view === 'orders' && <AdminOrders />}
        {view === 'products' && <AdminProducts />}
        {view === 'collections' && <AdminCollections />}
        {view === 'inventory' && <AdminInventory />}
        {view === 'promos' && <AdminPromos />}
        {view === 'reviews' && <AdminReviews />}
        {view === 'dashboard' && <AdminDashboard onViewOrders={() => setView('orders')} />}
        {view === 'history' && <AdminHistory />}
        {view === 'team' && role === 'owner' && <AdminTeam />}
      </div>
    </section>
  );
}
