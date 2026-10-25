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
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { fetchProducts, type Product } from '../../data/products';
import { formatDate, LOW_STOCK_THRESHOLD } from '../../lib/admin';
import StatusBadge from './StatusBadge';

interface DashboardOrderRow {
  order_reference: string;
  full_name: string;
  total: number;
  status: string;
  created_at: string;
}

interface DashboardSummary {
  total_orders: number;
  orders_today: number;
  pending_orders: number;
  completed_orders: number;
  collected_revenue: number;
  collected_order_count: number;
  best_seller: { name: string; quantity: number } | null;
  net_items_ordered: number;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [ordersRes, summaryRes, productsData] = await Promise.all([
          supabaseAdmin
            .from('orders')
            .select('order_reference, full_name, total, status, created_at')
            .order('created_at', { ascending: false })
            .limit(6),
          supabaseAdmin.rpc('admin_dashboard_summary'),
          fetchProducts(),
        ]);

        if (cancelled) return;

        if (ordersRes.error) throw new Error(ordersRes.error.message);
        if (summaryRes.error) throw new Error(summaryRes.error.message);

        setOrders((ordersRes.data ?? []) as DashboardOrderRow[]);
        setSummary(summaryRes.data as DashboardSummary);
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
  }, [refreshKey]);

  if (loading) return <p className="text-muted-foreground">Loading dashboard...</p>;
  if (error) return <p className="text-primary">{error}</p>;

  const metrics = summary ?? { total_orders: 0, orders_today: 0, pending_orders: 0, completed_orders: 0, collected_revenue: 0, collected_order_count: 0, best_seller: null, net_items_ordered: 0 };
  const completedShare = metrics.total_orders > 0 ? Math.round((metrics.completed_orders / metrics.total_orders) * 100) : 0;

  // Inventory belongs to each sellable edition + size, so keep the alert at
  // that exact granularity instead of summing stock across versions.
  let outOfStockCount = 0;
  const attentionVersions: { product: Product; versionName: string; sizes: { size: string; qty: number }[] }[] = [];
  for (const product of products) {
    for (const version of product.versions.filter((item) => item.isActive)) {
      const flaggedSizes = version.sizes
        .filter((item) => item.stock <= LOW_STOCK_THRESHOLD)
        .map((item) => ({ size: item.size, qty: item.stock }));
      outOfStockCount += flaggedSizes.filter((item) => item.qty <= 0).length;
      if (flaggedSizes.length > 0) attentionVersions.push({ product, versionName: version.versionName, sizes: flaggedSizes });
    }
  }
  const attentionProductCount = new Set(attentionVersions.map((item) => item.product.id)).size;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-xl text-foreground tracking-wide">Overview</h1>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">All-time orders and collected payments; inventory alerts are per edition and size.</p>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="btn-outline text-xs">Refresh overview</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <DashboardCard
          icon={ShoppingBag}
          label="Total Orders"
          value={metrics.total_orders}
          subtext={`${metrics.orders_today} today · all time`}
        />
        <DashboardCard
          icon={Clock}
          label="Pending Orders"
          value={metrics.pending_orders}
          subtext={metrics.pending_orders > 0 ? 'Needs attention' : 'No pending orders'}
          accent={metrics.pending_orders > 0 ? 'warning' : 'default'}
        />
        <DashboardCard
          icon={CheckCircle2}
          label="Completed Orders"
          value={metrics.completed_orders}
          subtext={`${completedShare}% of total`}
        />
        <DashboardCard
          icon={Wallet}
          label="Revenue"
          value={`Rs. ${Number(metrics.collected_revenue).toLocaleString()}`}
          subtext={`Rs. ${Math.round(Number(metrics.collected_order_count) ? Number(metrics.collected_revenue) / Number(metrics.collected_order_count) : 0).toLocaleString()} avg collected order · includes delivered legacy COD`}
        />
        <DashboardCard
          icon={AlertTriangle}
          label="Low Stock Products"
          value={attentionProductCount}
          subtext={outOfStockCount > 0 ? `${outOfStockCount} sizes out of stock` : 'Nothing out of stock'}
          accent={outOfStockCount > 0 ? 'danger' : attentionProductCount > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardSection
            title="Recent Orders"
            action={onViewOrders ? { label: 'View all', onClick: onViewOrders } : undefined}
          >
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {orders.map((order) => (
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
            {attentionVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">All stock levels look healthy.</p>
            ) : (
              <div className="space-y-3">
                {attentionVersions.slice(0, 5).map(({ product, versionName, sizes }) => (
                  <div key={`${product.id}-${versionName}`}>
                    <p className="text-sm font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{versionName}</p>
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
                {attentionVersions.length > 5 && (
                  <p className="text-xs text-muted">+{attentionVersions.length - 5} more editions</p>
                )}
              </div>
            )}
          </DashboardSection>

          <DashboardSection title="Best Seller">
            {metrics.best_seller ? (
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-display text-sm text-foreground tracking-wide">{metrics.best_seller.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.best_seller.quantity} ordered · {metrics.net_items_ordered} net items ordered
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
