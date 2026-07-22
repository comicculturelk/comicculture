import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  MessageCircle,
  ShoppingBag,
  Clock,
  AlertTriangle,
  Wallet,
  TrendingUp,
  PackagePlus,
  SlidersHorizontal,
  CheckCircle2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchProducts, getStockForSize, type Product } from '../data/products';
import {
  fetchInventoryMovements,
  restockProduct,
  adjustStock,
  ADJUSTMENT_REASONS,
  type InventoryMovement,
  type MovementType,
  type AdjustmentReason,
} from '../data/inventory';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;

const LOW_STOCK_THRESHOLD = 3;

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
  const [view, setView] = useState<'dashboard' | 'orders' | 'inventory' | 'history'>('orders');
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
              {(['dashboard', 'orders', 'inventory', 'history'] as const).map((v) => (
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
        {view === 'dashboard' && <AdminDashboard onViewOrders={() => setView('orders')} />}
        {view === 'history' && <AdminHistory />}
      </div>
    </section>
  );
}

type StockAction = { productId: string; size: string; kind: 'restock' | 'adjust' } | null;

function stockState(qty: number): 'out' | 'low' | 'ok' {
  return qty <= 0 ? 'out' : qty <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

function StockActionForm({
  action,
  onCancel,
  onDone,
}: {
  action: NonNullable<StockAction>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('correction');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty === 0) {
      setError('Enter a quantity');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (action.kind === 'restock') {
        await restockProduct(action.productId, action.size, Math.abs(qty), note.trim() || undefined);
      } else {
        await adjustStock(action.productId, action.size, qty, reason, note.trim() || undefined);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3"
    >
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted">
        {action.kind === 'restock' ? 'Quantity received' : 'Adjustment (+/-)'}
        <input
          type="number"
          autoFocus
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={action.kind === 'restock' ? 'e.g. 20' : 'e.g. -1'}
          className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>

      {action.kind === 'adjust' && (
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm capitalize text-foreground outline-none focus:border-primary"
          >
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r} value={r} className="bg-background">
                {r}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-xs uppercase tracking-wide text-muted">
        Note (optional)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={action.kind === 'restock' ? 'Supplier / batch ref' : 'What happened'}
          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={submitting} className="btn-primary px-4 py-2 text-sm">
          {submitting ? 'Saving...' : action.kind === 'restock' ? 'Add stock' : 'Save adjustment'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {error && <p className="w-full text-xs text-primary">{error}</p>}
    </form>
  );
}

function AdminInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<StockAction>(null);

  const loadProducts = () => {
    setLoading(true);
    fetchProducts()
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load products'))
      .finally(() => setLoading(false));
  };

  useEffect(loadProducts, []);

  const handleDone = () => {
    setActiveAction(null);
    loadProducts();
  };

  if (loading) return <p className="text-muted-foreground">Loading products...</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-primary">{error}</p>}
      {products.map((product) => (
        <div key={product.id} className="glass rounded-2xl p-6">
          <p className="font-display text-lg text-foreground tracking-wide">{product.name}</p>
          <div className="mt-4 space-y-3">
            {product.sizes.map((size) => {
              const qty = getStockForSize(product, size);
              const state = stockState(qty);
              const isActive =
                activeAction?.productId === product.id && activeAction?.size === size;
              return (
                <div key={size} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="w-10 text-xs font-medium uppercase tracking-wide text-muted">
                      {size}
                    </span>
                    <span
                      className={`font-display text-lg tracking-wide ${
                        state === 'out'
                          ? 'text-red-400'
                          : state === 'low'
                            ? 'text-yellow-400'
                            : 'text-foreground'
                      }`}
                    >
                      {qty}
                    </span>
                    {state === 'out' && (
                      <span className="text-[10px] uppercase tracking-wide text-red-400">
                        Out of stock
                      </span>
                    )}
                    {state === 'low' && (
                      <span className="text-[10px] uppercase tracking-wide text-yellow-400">
                        Low stock
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveAction(
                            isActive && activeAction?.kind === 'restock'
                              ? null
                              : { productId: product.id, size, kind: 'restock' }
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        Restock
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveAction(
                            isActive && activeAction?.kind === 'adjust'
                              ? null
                              : { productId: product.id, size, kind: 'adjust' }
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Adjust
                      </button>
                    </div>
                  </div>

                  {isActive && (
                    <StockActionForm
                      action={activeAction}
                      onCancel={() => setActiveAction(null)}
                      onDone={handleDone}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const MOVEMENT_STYLES: Record<MovementType, string> = {
  sale: 'border-blue-500/40 bg-blue-500/20 text-blue-400',
  restock: 'border-green-500/40 bg-green-500/20 text-green-400',
  adjustment: 'border-yellow-500/40 bg-yellow-500/20 text-yellow-400',
  cancellation: 'border-purple-500/40 bg-purple-500/20 text-purple-400',
};

function MovementBadge({ type }: { type: MovementType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${MOVEMENT_STYLES[type]}`}
    >
      {type}
    </span>
  );
}

function AdminHistory() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | MovementType>('all');

  useEffect(() => {
    setLoading(true);
    fetchInventoryMovements(typeFilter === 'all' ? {} : { changeType: typeFilter })
      .then(setMovements)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'sale', 'restock', 'adjustment', 'cancellation'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              typeFilter === t
                ? 'border-primary bg-primary/20 text-primary'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted-foreground">Loading history...</p>}
      {error && <p className="text-primary">{error}</p>}
      {!loading && movements.length === 0 && (
        <p className="text-muted">No inventory movements match this filter.</p>
      )}

      <div className="space-y-3">
        {movements.map((m) => (
          <div key={m.id} className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4">
            <div className="min-w-[160px]">
              <p className="font-display text-sm text-foreground tracking-wide">{m.productName}</p>
              <p className="text-xs text-muted">{formatDate(m.createdAt)}</p>
            </div>
            <span className="text-xs uppercase tracking-wide text-muted">Size {m.size}</span>
            <MovementBadge type={m.changeType} />
            <span
              className={`font-display text-sm tracking-wide ${
                m.quantityChange > 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {m.quantityChange > 0 ? '+' : ''}
              {m.quantityChange}
            </span>
            <span className="text-xs text-muted-foreground">→ {m.resultingStock} in stock</span>
            {m.reason && (
              <span className="text-xs capitalize text-muted-foreground">{m.reason}</span>
            )}
            {m.note && <span className="text-xs text-muted">"{m.note}"</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

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

type CardAccent = 'default' | 'warning' | 'danger';

const CARD_ACCENT_STYLES: Record<CardAccent, string> = {
  default: 'text-foreground',
  warning: 'text-yellow-400',
  danger: 'text-red-400',
};

function DashboardCard({
  icon: Icon,
  label,
  value,
  subtext,
  accent = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtext?: string;
  accent?: CardAccent;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 font-display text-2xl tracking-wide ${CARD_ACCENT_STYLES[accent]}`}>{value}</p>
      {subtext && <p className="mt-1 text-xs text-muted">{subtext}</p>}
    </div>
  );
}

function DashboardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {action.label}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function AdminDashboard({ onViewOrders }: { onViewOrders?: () => void }) {
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
  const completedOrders = orders.filter((o) => o.status === 'delivered').length;
  const nonCancelledOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = nonCancelledOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const avgOrderValue = nonCancelledOrders.length > 0 ? totalRevenue / nonCancelledOrders.length : 0;
  const completedShare = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  // Products that have at least one size at or below the low-stock threshold,
  // with the specific sizes that need attention — reused for both the KPI
  // card and the "Needs Restocking" panel below.
  let outOfStockCount = 0;
  const attentionProducts: { product: Product; sizes: { size: string; qty: number }[] }[] = [];
  for (const product of products) {
    const flaggedSizes: { size: string; qty: number }[] = [];
    for (const size of product.sizes) {
      const qty = getStockForSize(product, size);
      if (qty <= 0) outOfStockCount += 1;
      if (qty <= LOW_STOCK_THRESHOLD) flaggedSizes.push({ size, qty });
    }
    if (flaggedSizes.length > 0) attentionProducts.push({ product, sizes: flaggedSizes });
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

  const recentOrders = orders.slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-xl text-foreground tracking-wide">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">A snapshot of how the store is doing right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <DashboardCard
          icon={ShoppingBag}
          label="Total Orders"
          value={totalOrders}
          subtext={ordersToday > 0 ? `${ordersToday} today` : 'No orders today'}
        />
        <DashboardCard
          icon={Clock}
          label="Pending Orders"
          value={pendingOrders}
          subtext={pendingOrders > 0 ? 'Needs confirmation' : 'All caught up'}
          accent={pendingOrders > 0 ? 'warning' : 'default'}
        />
        <DashboardCard
          icon={CheckCircle2}
          label="Completed Orders"
          value={completedOrders}
          subtext={`${completedShare}% of total`}
        />
        <DashboardCard
          icon={Wallet}
          label="Revenue"
          value={`Rs. ${totalRevenue.toLocaleString()}`}
          subtext={`Rs. ${Math.round(avgOrderValue).toLocaleString()} avg order`}
        />
        <DashboardCard
          icon={AlertTriangle}
          label="Low Stock Products"
          value={attentionProducts.length}
          subtext={outOfStockCount > 0 ? `${outOfStockCount} sizes out of stock` : 'Nothing out of stock'}
          accent={outOfStockCount > 0 ? 'danger' : attentionProducts.length > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardSection
            title="Recent Orders"
            action={onViewOrders ? { label: 'View all', onClick: onViewOrders } : undefined}
          >
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <div
                    key={order.order_reference}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-[120px]">
                      <p className="font-display text-sm text-foreground tracking-wide">
                        {order.order_reference}
                      </p>
                      <p className="text-xs text-muted">{formatDate(order.created_at)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{order.full_name}</p>
                    <p className="text-sm font-medium text-primary">Rs. {order.total}</p>
                    <StatusBadge status={order.status} />
                  </div>
                ))}
              </div>
            )}
          </DashboardSection>
        </div>

        <div className="flex flex-col gap-6">
          <DashboardSection title="Needs Restocking">
            {attentionProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">All stock levels look healthy.</p>
            ) : (
              <div className="space-y-3">
                {attentionProducts.slice(0, 5).map(({ product, sizes }) => (
                  <div key={product.id}>
                    <p className="text-sm font-medium text-foreground">{product.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sizes.map(({ size, qty }) => (
                        <span
                          key={size}
                          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                            qty <= 0
                              ? 'border-red-500/40 bg-red-500/10 text-red-400'
                              : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
                          }`}
                        >
                          {size} · {qty <= 0 ? 'out' : qty}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {attentionProducts.length > 5 && (
                  <p className="text-xs text-muted">+{attentionProducts.length - 5} more products</p>
                )}
              </div>
            )}
          </DashboardSection>

          <DashboardSection title="Best Seller">
            {bestSeller ? (
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-display text-sm text-foreground tracking-wide">{bestSeller}</p>
                  <p className="text-xs text-muted-foreground">
                    {bestSellerQty} sold · {totalItemsSold} items sold in total
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            )}
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}
