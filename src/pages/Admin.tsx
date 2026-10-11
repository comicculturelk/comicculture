import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import AdminProducts from '../components/admin/AdminProducts';
import AdminCollections from '../components/admin/AdminCollections';
import AdminDashboard from '../components/admin/AdminDashboard';
import AdminHistory from '../components/admin/AdminHistory';
import AdminInventory from '../components/admin/AdminInventory';
import AdminOrders from '../components/admin/AdminOrders';
import AdminPromos from '../components/admin/AdminPromos';
import AdminReviews from '../components/admin/AdminReviews';

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabaseAdmin.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabaseAdmin.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return (
      <section className="comic-page flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted">Loading...</p>
      </section>
    );
  }

  return session ? <AdminPanel /> : <AdminLogin />;
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
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setLoading(false);
  };

  return (
    <section className="comic-page flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={handleSubmit} className="glass w-full max-w-sm space-y-4 rounded-2xl p-8">
        <h1 className="font-display text-2xl text-foreground tracking-wide">ADMIN LOGIN</h1>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <input
          type="password"
          required
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

function AdminPanel() {
  const [view, setView] = useState<
    'dashboard' | 'orders' | 'products' | 'collections' | 'inventory' | 'promos' | 'reviews' | 'history'
  >('orders');

  const handleSignOut = () => supabaseAdmin.auth.signOut();

  return (
    <section className="comic-page min-h-screen bg-background px-6 py-24 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-3xl text-foreground tracking-wide">ADMIN</h1>
            <div className="flex flex-wrap gap-2">
              {(
                ['dashboard', 'orders', 'products', 'collections', 'inventory', 'promos', 'reviews', 'history'] as const
              ).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    view === v
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={handleSignOut} className="btn-outline text-sm">
            Sign Out
          </button>
        </div>

        {view === 'orders' && <AdminOrders />}
        {view === 'products' && <AdminProducts />}
        {view === 'collections' && <AdminCollections />}
        {view === 'inventory' && <AdminInventory />}
        {view === 'promos' && <AdminPromos />}
        {view === 'reviews' && <AdminReviews />}
        {view === 'dashboard' && <AdminDashboard onViewOrders={() => setView('orders')} />}
        {view === 'history' && <AdminHistory />}
      </div>
    </section>
  );
}
