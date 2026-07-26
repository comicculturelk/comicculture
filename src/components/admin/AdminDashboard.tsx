import { useEffect, useState, type ReactNode } from 'react';
import {
  ShoppingBag,
  Clock,
  AlertTriangle,
  Wallet,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchProducts, getStockForSize, type Product } from '../../data/products';
import { formatDate, StatusBadge, LOW_STOCK_THRESHOLD } from '../../pages/Admin';

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

export default function AdminDashboard({ onViewOrders }: { onViewOrders?: () => void }) {
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
