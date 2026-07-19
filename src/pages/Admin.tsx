import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;

interface OrderItemRow {
  id: string;
  name: string;
  size: string;
  quantity: number;
  price: number;
}

interface OrderRow {
  id: string;
  order_reference: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  district: string;
  postal_code: string | null;
  total: number;
  status: string;
  created_at: string;
  order_items: OrderItemRow[];
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-white/50">Loading...</p>
      </section>
    );
  }

  return session ? <AdminOrders /> : <AdminLogin />;
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setLoading(false);
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={handleSubmit} className="glass w-full max-w-sm space-y-4 rounded-2xl p-8">
        <h1 className="font-display text-2xl text-white tracking-wide">ADMIN LOGIN</h1>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-primary">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </section>
  );
}

function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setOrders((data ?? []) as OrderRow[]);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId: string, status: string) => {
    setUpdatingId(orderId);
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (!updateError) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    }
    setUpdatingId(null);
  };

  const handleSignOut = () => supabase.auth.signOut();

  return (
    <section className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl text-white tracking-wide">ORDERS</h1>
          <button type="button" onClick={handleSignOut} className="btn-outline text-sm">
            Sign Out
          </button>
        </div>

        {loading && <p className="text-white/50">Loading orders...</p>}
        {error && <p className="text-primary">{error}</p>}

        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="glass rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg text-white tracking-wide">
                    {order.order_reference}
                  </p>
                  <p className="text-xs text-white/40">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <select
                  value={order.status}
                  disabled={updatingId === order.id}
                  onChange={(e) => handleStatusChange(order.id, e.target.value)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-primary"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-background">
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-white/40">Customer</p>
                  <p className="text-white/80">{order.full_name}</p>
                  <p className="text-white/80">{order.phone}</p>
                </div>
                <div>
                  <p className="text-white/40">Address</p>
                  <p className="text-white/80">
                    {order.address_line1}
                    {order.address_line2 ? `, ${order.address_line2}` : ''}
                  </p>
                  <p className="text-white/80">
                    {order.city}, {order.district} {order.postal_code ?? ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="mb-2 text-white/40">Items</p>
                <ul className="space-y-1 text-sm text-white/70">
                  {order.order_items.map((item) => (
                    <li key={item.id}>
                      {item.name} — Size {item.size} · Qty {item.quantity} · Rs. {item.price}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-4 text-right font-display text-lg text-primary">
                Total: Rs. {order.total}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
