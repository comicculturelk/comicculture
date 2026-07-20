import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  MessageCircle,
  ShoppingBag,
  Clock,
  AlertTriangle,
  Wallet,
  PackageX,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchProducts, updateProductStock, getStockForSize, type Product } from '../data/products';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const hours24 = d.getHours();
  const hours = hours24 % 12 || 12;
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes} ${ampm}`;
}

function toWhatsAppLink(phone: string, customerName: string, orderReference: string): string {
  const digits = phone.replace(/\D/g, '');
  const number = digits.startsWith('94')
    ? digits
    : digits.startsWith('0')
      ? `94${digits.slice(1)}`
      : `94${digits}`;
  const message = `Hi ${customerName}, this is ComicCulture regarding your order ${orderReference}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-yellow-500/40 bg-yellow-500/20 text-yellow-400',
  confirmed: 'border-blue-500/40 bg-blue-500/20 text-blue-400',
  packed: 'border-purple-500/40 bg-purple-500/20 text-purple-400',
  shipped: 'border-orange-500/40 bg-orange-500/20 text-orange-400',
  delivered: 'border-green-500/40 bg-green-500/20 text-green-400',
  cancelled: 'border-red-500/40 bg-red-500/20 text-red-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? 'border-border bg-surface text-muted-foreground'
      }`}
    >
      {status}
    </span>
  );
}

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
        <p className="text-muted">Loading...</p>
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

function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof STATUSES)[number]>('all');
  const [view, setView] = useState<'dashboard' | 'orders' | 'inventory'>('orders');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const filteredOrders =
    statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

  return (
    <section className="min-h-screen bg-background px-6 py-24 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-3xl text-foreground tracking-wide">ADMIN</h1>
            <div className="flex gap-2">
              {(['dashboard', 'orders', 'inventory'] as const).map((v) => (
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

        {loading && view === 'orders' && <p className="text-muted-foreground">Loading orders...</p>}
        {error && <p className="text-primary">{error}</p>}

        {view === 'orders' && (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              {(['all', ...STATUSES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    statusFilter === s
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {!loading && filteredOrders.length === 0 && (
              <p className="text-muted">No orders match this filter.</p>
            )}

            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const isExpanded = expandedIds.has(order.id);
                return (
                  <div key={order.id} className="glass rounded-2xl p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-display text-lg text-foreground tracking-wide">
                          {order.order_reference}
                        </p>
                        <p className="text-xs text-muted">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                          <span className="text-xs uppercase tracking-wide text-muted">Status</span>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={order.status} />
                          <select
                            value={order.status}
                            disabled={updatingId === order.id}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s} className="bg-background">
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{order.full_name}</p>
                        <p className="text-muted">{order.phone}</p>
                      </div>
                      <p className="font-display text-lg text-primary">Rs. {order.total}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpand(order.id)}
                      className="mt-4 text-xs font-medium text-muted transition-colors hover:text-foreground"
                    >
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </button>

                    {isExpanded && (
                      <>
                        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                            <p className="mt-1 font-medium text-foreground">{order.full_name}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <p className="text-muted-foreground">{order.phone}</p>
                              <a
                                href={toWhatsAppLink(order.phone, order.full_name, order.order_reference)}
                                target="_blank"
                                rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-green-500"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                WhatsApp
                              </a>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted">Address</p>
                            <p className="mt-1 text-muted-foreground">
                              {order.address_line1}
                              {order.address_line2 ? `, ${order.address_line2}` : ''}
                            </p>
                            <p className="text-muted-foreground">
                              {order.city}, {order.district} {order.postal_code ?? ''}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-border pt-4">
                          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Items</p>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {order.order_items.map((item) => (
                              <li key={item.id} className="flex justify-between">
                                <span>
                                  {item.name}{' '}
                                  <span className="text-muted">
                                    · Size {item.size} · Qty {item.quantity}
                                  </span>
                                </span>
                                <span className="text-muted">Rs. {item.price}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'inventory' && <AdminInventory />}
        {view === 'dashboard' && <AdminDashboard />}
      </div>
    </section>
  );
}

function AdminInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    fetchProducts()
      .then((data) => {
        setProducts(data);
        setDraft(Object.fromEntries(data.map((p) => [p.id, { ...(p.stock ?? {}) }])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load products'))
      .finally(() => setLoading(false));
  }, []);

  const handleStockChange = (productId: string, size: string, value: string) => {
    const qty = Math.max(0, Number(value) || 0);
    setDraft((prev) => ({ ...prev, [productId]: { ...prev[productId], [size]: qty } }));
    setSavedId(null);
  };

  const handleSave = async (productId: string) => {
    setSavingId(productId);
    try {
      await updateProductStock(productId, draft[productId] ?? {});
      setSavedId(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save stock');
    }
    setSavingId(null);
  };

  if (loading) return <p className="text-muted-foreground">Loading products...</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-primary">{error}</p>}
      {products.map((product) => (
        <div key={product.id} className="glass rounded-2xl p-6">
          <p className="font-display text-lg text-foreground tracking-wide">{product.name}</p>
          <div className="mt-4 flex flex-wrap gap-4">
            {product.sizes.map((size) => {
              const qty = draft[product.id]?.[size] ?? 0;
              const stockState = qty <= 0 ? 'out' : qty <= 3 ? 'low' : 'ok';
              return (
                <label
                  key={size}
                  className="flex flex-col items-center gap-1 text-xs uppercase tracking-wide text-muted"
                >
                  {size}
                  <input
                    type="number"
                    min={0}
                    value={qty}
                    onChange={(e) => handleStockChange(product.id, size, e.target.value)}
                    className={`w-16 rounded-lg border bg-surface px-2 py-1.5 text-center text-sm outline-none focus:border-primary ${
                      stockState === 'out'
                        ? 'border-red-500/60 text-red-400'
                        : stockState === 'low'
                          ? 'border-yellow-500/60 text-yellow-400'
                          : 'border-border text-foreground'
                    }`}
                  />
                  {stockState === 'out' && (
                    <span className="normal-case text-[10px] text-red-400">Out of stock</span>
                  )}
                  {stockState === 'low' && (
                    <span className="normal-case text-[10px] text-yellow-400">Low stock</span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSave(product.id)}
              disabled={savingId === product.id}
              className="btn-primary px-6 py-2 text-sm"
            >
              {savingId === product.id ? 'Saving...' : 'Save'}
            </button>
            {savedId === product.id && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const LOW_STOCK_THRESHOLD = 3;

interface DashboardOrderRow {
  order_reference: string;
  full_name: string;
  total: number;
  status: string;
  created_at: string;
}

interface DashboardOrderItemRow {
  name: string;
  quantity: number;
}

function isSameDay(iso: string, reference: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === reference.getFullYear() &&
    d.getMonth() === reference.getMonth() &&
    d.getDate() === reference.getDate()
  );
}

function DashboardCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl text-foreground tracking-wide">{value}</p>
    </div>
  );
}

function AdminDashboard() {
  const [orders, setOrders] = useState<DashboardOrderRow[]>([]);
  const [orderItems, setOrderItems] = useState<DashboardOrderItemRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [ordersRes, itemsRes, productsData] = await Promise.all([
          supabase
            .from('orders')
            .select('order_reference, full_name, total, status, created_at')
            .order('created_at', { ascending: false }),
          supabase.from('order_items').select('name, quantity'),
          fetchProducts(),
        ]);

        if (cancelled) return;

        if (ordersRes.error) throw new Error(ordersRes.error.message);
        if (itemsRes.error) throw new Error(itemsRes.error.message);

        setOrders((ordersRes.data ?? []) as DashboardOrderRow[]);
        setOrderItems((itemsRes.data ?? []) as DashboardOrderItemRow[]);
        setProducts(productsData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading dashboard...</p>;
  if (error) return <p className="text-primary">{error}</p>;

  const today = new Date();
  const totalOrders = orders.length;
  const ordersToday = orders.filter((o) => isSameDay(o.created_at, today)).length;
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total), 0);

  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const product of products) {
    for (const size of product.sizes) {
      const qty = getStockForSize(product, size);
      if (qty <= 0) outOfStockCount += 1;
      else if (qty <= LOW_STOCK_THRESHOLD) lowStockCount += 1;
    }
  }

  const salesByName = new Map<string, number>();
  let totalItemsSold = 0;
  for (const item of orderItems) {
    totalItemsSold += item.quantity;
    salesByName.set(item.name, (salesByName.get(item.name) ?? 0) + item.quantity);
  }
  let bestSeller: string | null = null;
  let bestSellerQty = 0;
  for (const [name, qty] of salesByName) {
    if (qty > bestSellerQty) {
      bestSeller = name;
      bestSellerQty = qty;
    }
  }

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard icon={ShoppingBag} label="Total Orders" value={totalOrders} />
        <DashboardCard icon={Clock} label="Orders Today" value={ordersToday} />
        <DashboardCard icon={AlertTriangle} label="Pending Orders" value={pendingOrders} />
        <DashboardCard icon={Wallet} label="Total Revenue" value={`Rs. ${totalRevenue.toLocaleString()}`} />
      </div>

      <div>
        <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Inventory Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DashboardCard icon={AlertTriangle} label="Low Stock Sizes" value={lowStockCount} />
          <DashboardCard icon={PackageX} label="Out of Stock Sizes" value={outOfStockCount} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Sales Insights</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DashboardCard icon={TrendingUp} label="Best Selling Product" value={bestSeller ?? 'No sales yet'} />
          <DashboardCard icon={ShoppingBag} label="Total Items Sold" value={totalItemsSold} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Recent Activity</h2>
        {recentOrders.length === 0 ? (
          <p className="text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.order_reference}
                className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
              >
                <div>
                  <p className="font-display text-sm text-foreground tracking-wide">{order.order_reference}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                </div>
                <p className="text-sm text-muted-foreground">{order.full_name}</p>
                <p className="text-sm font-medium text-primary">Rs. {order.total}</p>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
