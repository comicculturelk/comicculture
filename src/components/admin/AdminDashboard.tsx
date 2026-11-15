import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Clock3,
  Package, PackageSearch, RefreshCw, ShoppingBag, Wallet, type LucideIcon,
} from 'lucide-react';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { formatPrice, formatSize } from '../../data/products';
import { formatPaymentStatus, LOW_STOCK_THRESHOLD, ORDER_STATUSES, PAYMENT_STATUSES } from '../../lib/admin';
import StatusBadge from './StatusBadge';
import { ADMIN_PERIODS as PERIODS, type AdminPeriod as Period } from '../../lib/adminPeriods';
type Bucket = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
type DemandClass = 'zero' | 'low' | 'new';

interface Metrics {
  revenue: number;
  placed: number;
  units: number;
  aov: number | null;
  collected_orders: number;
  shipping: number;
  discounts: number;
  awaiting_action: number;
  overdue: number;
}

interface Edition {
  id: string;
  edition: string;
  units: number;
}

interface StockSize {
  id: string;
  product: string;
  edition: string;
  size: string;
  stock: number;
}

interface QuietItem {
  grain: 'design' | 'variant';
  id: string;
  product: string;
  edition: string | null;
  size: string | null;
  stock: number;
  units: number;
  classification: DemandClass;
  total: number;
}

interface TrendPoint {
  bucket: string;
  revenue: number;
  placed: number;
}

interface Analytics {
  range: { start: string; end: string; as_of: string; previous_start: string | null; previous_end: string | null; bin: Bucket };
  current: Metrics;
  previous: Metrics | null;
  trend: TrendPoint[];
  orders: Record<string, number>;
  payments: Record<string, number>;
  bank_review: number;
  recent: { order_reference: string; status: string; created_at: string; total: number }[];
  bestsellers: { product_id: string; name: string; image: string | null; units: number; value: number; editions: Edition[]; edition_count: number }[];
  editions: (Edition & { product: string; value: number })[];
  sizes: { size: string; units: number }[];
  quiet: QuietItem[];
  stock: { low: number; out: number; products: number; threshold: number; alerts: StockSize[] };
}

const DEMAND_TABS: [DemandClass, string][] = [['zero', 'Zero orders'], ['low', 'Low demand'], ['new', 'New listings']];
const number = new Intl.NumberFormat('en-LK');
const compact = new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 1 });
const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });
const timeLabel = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function dateRange(start: string, end: string) {
  const from = start.slice(0, 4) === end.slice(0, 4) ? shortDate : dateLabel;
  const last = dateLabel.format(new Date(end));
  return start === end ? last : from.format(new Date(start)) + ' – ' + last;
}

function bucketLabel(value: string, bin: Bucket) {
  if (bin === 'hour') return value.slice(11, 16);
  if (bin === 'year') return value.slice(0, 4);
  if (bin === 'month') return monthLabel.format(new Date(value + 'Z'));
  if (bin === 'quarter') return 'Q' + Math.ceil(Number(value.slice(5, 7)) / 3) + ' ' + value.slice(0, 4);
  return shortDate.format(new Date(value + 'Z'));
}

const panel = 'min-w-0 rounded-xl border border-border bg-surface';
const pill = 'rounded-md px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const activePill = 'border border-border bg-surface text-foreground shadow-sm';
const inactivePill = 'border border-transparent text-muted hover:bg-surface hover:text-foreground';
const actionClass = 'inline-flex shrink-0 items-center gap-1.5 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';

function Panel({ title, detail, action, children }: { title: string; detail?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={panel + ' p-4 sm:p-5'}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-background px-3 py-5 text-center text-sm text-muted">{children}</p>;
}

function Action({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button className={actionClass} type="button" onClick={onClick}>{children}<ArrowRight aria-hidden="true" size={14} /></button>;
}

function Change({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return null;
  if (!previous) return current > 0 ? <span className="text-muted">No previous baseline</span> : null;
  const delta = Math.round((current - previous) / previous * 100);
  if (!delta) return <span className="text-muted">0% vs prior</span>;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={delta > 0 ? 'text-green-700' : 'text-red-700'}>
      <Icon aria-hidden="true" size={13} className="mr-0.5 inline align-text-bottom" />
      {delta > 0 ? '+' : ''}{number.format(delta)}% vs prior
    </span>
  );
}

function Kpi({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: ReactNode; children: ReactNode }) {
  return (
    <div className={panel + ' p-3 sm:p-4'}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon aria-hidden="true" size={16} className="shrink-0 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <p className="my-2 break-words text-lg font-bold leading-tight tracking-tight tabular-nums text-foreground sm:text-2xl">{value}</p>
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-snug text-muted">{children}</div>
    </div>
  );
}

const BUCKET_NAMES: Record<Bucket, string> = {
  hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly',
};

function SalesTrend({ points, bin }: { points: TrendPoint[]; bin: Bucket }) {
  const [measure, setMeasure] = useState<'revenue' | 'placed'>('revenue');
  const [cursor, setCursor] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((point) => point[measure]));
  const peak = Math.max(4, Math.ceil(max / 4) * 4);
  const lastWithSales = points.reduce((last, point, index) => point[measure] > 0 ? index : last, 0);
  const active = Math.min(cursor ?? lastWithSales, points.length - 1);
  const point = points[active];
  const display = measure === 'revenue' ? formatPrice : number.format;
  const ticks = [...new Set([0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1])];

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offsets: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: points.length - 1 };
    if (!Object.prototype.hasOwnProperty.call(offsets, event.key)) return;
    event.preventDefault();
    const next = Math.min(points.length - 1, Math.max(0, offsets[event.key]));
    event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
  }

  return (
    <Panel title="Sales performance" detail={BUCKET_NAMES[bin] + ' · by order placement date'} action={(
      <div role="group" aria-label="Chart measure" className="flex rounded-lg bg-background p-1">
        {([['revenue', 'Revenue'], ['placed', 'Orders']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={measure === key} onClick={() => { setMeasure(key); setCursor(null); }}
            className={pill + ' ' + (measure === key ? activePill : inactivePill)}>{label}</button>
        ))}
      </div>
    )}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-live="polite">
        <span className="text-xl font-bold tracking-tight tabular-nums">{point ? display(point[measure]) : '—'}</span>
        {point && <span className="text-xs text-muted">{bin === 'week' && 'Week of '}{bucketLabel(point.bucket, bin)}</span>}
        {!max && <span className="text-xs text-muted">{measure === 'revenue' ? 'No collected revenue in this period' : 'No orders in this period'}</span>}
      </div>
      {point && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2" aria-label={measure === 'revenue' ? 'Collected revenue in rupees' : 'Orders placed'}>
          <div aria-hidden="true" className="relative h-40 min-w-8 text-right text-[10px] tabular-nums text-muted sm:h-48">
            {[1, .75, .5, .25, 0].map((line) => (
              <span key={line} className="absolute right-0 -translate-y-1/2" style={{ top: (1 - line) * 100 + '%' }}>{compact.format(peak * line)}</span>
            ))}
          </div>
          <div className="relative h-40 sm:h-48">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3, 4].map((line) => <div key={line} className="border-t border-border" />)}
            </div>
            <div className={'relative flex h-full justify-center ' + (points.length > 45 ? 'gap-px' : 'gap-0.5 sm:gap-1')}>
              {points.map((entry, index) => (
                <button key={entry.bucket} type="button" tabIndex={index === active ? 0 : -1}
                  aria-label={(bin === 'week' ? 'Week of ' : '') + bucketLabel(entry.bucket, bin) + ', ' + display(entry[measure])}
                  onPointerEnter={() => setCursor(index)} onFocus={() => setCursor(index)} onClick={() => setCursor(index)}
                  onKeyDown={(event) => move(event, index)}
                  className="flex min-w-0 max-w-24 flex-1 items-end rounded-sm focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  <span aria-hidden="true" className={'w-full rounded-t-sm ' + (index === active ? 'bg-primary' : 'bg-primary/40')}
                    style={{ height: entry[measure] ? Math.max(1, entry[measure] / peak * 100) + '%' : '1px' }} />
                </button>
              ))}
            </div>
          </div>
          <div aria-hidden="true" className="col-start-2 mt-2 flex justify-between gap-1 text-[10px] tabular-nums text-muted sm:text-xs">
            {ticks.map((index) => <span key={index}>{bucketLabel(points[index].bucket, bin)}</span>)}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Counts({ counts, entries }: { counts: Record<string, number>; entries: readonly string[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {entries.map((key) => (
        <div className="flex justify-between gap-1.5 text-xs" key={key}>
          <dt className="text-muted">{formatPaymentStatus(key)}</dt><dd className="font-semibold tabular-nums">{number.format(counts[key] ?? 0)}</dd>
        </div>
      ))}
    </dl>
  );
}

function InventoryAlerts({ stock, onInventory }: { stock: Analytics['stock']; onInventory: () => void }) {
  return (
    <Panel title="Inventory alerts" detail={number.format(stock.products) + ' affected designs · live stock'} action={<Action onClick={onInventory}>Manage inventory</Action>}>
      {!stock.alerts.length ? <Empty>No sizes need restocking.</Empty> : (
        <ul className="divide-y divide-border">
          {stock.alerts.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 break-words text-sm">
                <p className="font-semibold">{row.product}</p>
                <p className="text-xs text-muted">{row.edition} · {formatSize(row.size)}</p>
              </div>
              <span className={'shrink-0 rounded-md px-2 py-1 text-xs font-semibold ' + (row.stock === 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
                {row.stock === 0 ? 'Out of stock' : row.stock + ' left'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {stock.low + stock.out > stock.alerts.length && <p className="mt-3 text-xs text-muted">Showing the {stock.alerts.length} sizes with least stock.</p>}
    </Panel>
  );
}

function QuietDemand({ items, onInventory }: { items: QuietItem[]; onInventory: () => void }) {
  const [grain, setGrain] = useState<QuietItem['grain']>('design');
  const [classification, setClassification] = useState<DemandClass>('zero');
  const scoped = items.filter((item) => item.grain === grain);
  const shown = scoped.filter((item) => item.classification === classification);
  const total = shown[0]?.total ?? 0;
  return (
    <Panel title="Slow-moving inventory" detail="Active catalog ranked by stock on hand." action={<Action onClick={onInventory}>Manage inventory</Action>}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Demand detail" className="flex rounded-lg bg-background p-1">
          {([['design', 'Designs'], ['variant', 'Edition sizes']] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={grain === key} onClick={() => setGrain(key)}
              className={pill + ' ' + (grain === key ? activePill : inactivePill)}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Demand category" className="flex flex-wrap gap-x-0.5">
          {DEMAND_TABS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={classification === key} onClick={() => setClassification(key)}
              className={pill + ' ' + (classification === key ? 'border border-primary/20 bg-primary/5 text-primary' : inactivePill)}>
              {label} <span className="tabular-nums">{scoped.find((item) => item.classification === key)?.total ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      {!shown.length ? <Empty>No matches in this category.</Empty> : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem] gap-2 border-b border-border pb-2 text-xs font-medium text-muted">
            <span>{grain === 'design' ? 'Design' : 'Variant'}</span><span className="text-right">Ordered</span><span className="text-right">Stock</span>
          </div>
          <ul className="divide-y divide-border">
            {shown.map((item) => (
              <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem] items-center gap-2 py-2.5 text-sm">
                <div className="min-w-0 break-words">
                  <p className="font-semibold">{item.product}</p>
                  {item.size && <p className="text-xs text-muted">{item.edition} · {formatSize(item.size)}</p>}
                </div>
                <span className="text-right tabular-nums text-muted">{number.format(item.units)}</span>
                <span className="text-right font-semibold tabular-nums">{number.format(item.stock)}</span>
              </li>
            ))}
          </ul>
          {total > shown.length && <p className="mt-1 text-xs text-muted">Showing {shown.length} of {number.format(total)}, highest stock first.</p>}
        </>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted">New listings are under 14 days old. Low demand is up to 1 unit per 30 observed days, with a 1-unit minimum cutoff.</p>
    </Panel>
  );
}

export default function AdminDashboard({ onOrders, onInventory }: { onOrders: () => void; onInventory: () => void }) {
  const [period, setPeriod] = useState<Period>('30d');
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ period: Period; data: Analytics } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setPending(true);
      setFailed(false);
      try {
        const { data, error } = await supabaseAdmin.rpc('admin_dashboard_analytics', {
          p_period: period,
          p_low_stock_threshold: LOW_STOCK_THRESHOLD,
        }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error || !data) throw new Error('Dashboard request failed');
        setLoaded({ period, data: data as Analytics });
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [period, refresh]);

  const data = loaded?.period === period ? loaded.data : null;
  const refreshDashboard = () => setRefresh((value) => value + 1);
  const [showTen, setShowTen] = useState(false);

  return (
    <div className="space-y-5" aria-busy={pending}>
      <header className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Store performance</h2>
          <p className="mt-1 text-sm text-muted">Sales, order fulfilment and inventory.</p>
        </div>
        <button type="button" className="btn-outline inline-flex shrink-0 items-center gap-2 text-xs max-sm:!px-3" onClick={refreshDashboard} disabled={pending}>
          <RefreshCw size={15} aria-hidden="true" />
          <span className="max-sm:sr-only">{pending && data ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Reporting period" className="flex max-w-full flex-wrap gap-0.5 rounded-lg border border-border bg-background p-1">
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={period === key} onClick={() => { setPeriod(key); setShowTen(false); }}
              className={pill + ' whitespace-nowrap max-sm:!px-1.5 max-sm:!text-[11px] ' + (period === key ? activePill : inactivePill)}>{label}</button>
          ))}
        </div>
        {data && (
          <div className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <CalendarDays size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground">{dateRange(data.range.start, data.range.end)} · Asia/Colombo</p>
              <p>Through {timeLabel.format(new Date(data.range.as_of))} today{data.range.previous_start && data.range.previous_end
                ? ' · vs ' + dateRange(data.range.previous_start, data.range.previous_end) + ' at the same cutoff' : ''}</p>
            </div>
          </div>
        )}
      </div>

      {failed && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {data ? 'Refresh failed. Showing the last successful results for this period.' : 'Could not load dashboard data.'}
        <button type="button" className={actionClass} onClick={refreshDashboard}>Retry</button>
      </div>}
      {!data && !failed && <p className={panel + ' p-6 text-sm text-muted'} role="status">Loading dashboard…</p>}
      {data && (
        <>
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
            <Kpi icon={Wallet} label="Collected revenue" value={formatPrice(data.current.revenue)}>
              <Change current={data.current.revenue} previous={data.previous?.revenue ?? null} />
              <span>{number.format(data.current.collected_orders)} collected orders</span>
            </Kpi>
            <Kpi icon={ShoppingBag} label="Orders placed" value={number.format(data.current.placed)}>
              <Change current={data.current.placed} previous={data.previous?.placed ?? null} /><span>All order statuses</span>
            </Kpi>
            <Kpi icon={Package} label="Units ordered" value={number.format(data.current.units)}>
              <Change current={data.current.units} previous={data.previous?.units ?? null} /><span>Eligible orders</span>
            </Kpi>
            <Kpi icon={BarChart3} label="Avg. order value" value={data.current.aov === null ? '—' : formatPrice(data.current.aov)}>
              <Change current={data.current.aov} previous={data.previous?.aov ?? null} /><span>Per collected order</span>
            </Kpi>
            <Kpi icon={Clock3} label="Awaiting action" value={number.format(data.current.awaiting_action)}>
              <span className={data.current.overdue ? 'font-semibold text-amber-800' : ''}>{number.format(data.current.overdue)} pending 48h+</span>
            </Kpi>
            <Kpi icon={PackageSearch} label="Stock alerts · live" value={number.format(data.stock.out + data.stock.low)}>
              <span className={data.stock.out ? 'font-semibold text-red-700' : ''}>{number.format(data.stock.out)} out</span>
              <span>{number.format(data.stock.low)} low</span>
            </Kpi>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <SalesTrend key={period} points={data.trend} bin={data.range.bin} />
            <Panel title="Orders and payments" detail="Current states for orders placed in this period." action={<Action onClick={onOrders}>Manage orders</Action>}>
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
                <p><strong className="mr-1 text-base tabular-nums">{number.format(data.bank_review)}</strong> bank transfers to verify</p>
                <p><strong className="mr-1 text-base tabular-nums">{number.format(data.current.overdue)}</strong> pending for 48h+</p>
              </div>
              <Counts counts={data.orders} entries={ORDER_STATUSES} />
              <details className="mt-3 border-t border-border pt-3">
                <summary className="mb-3 cursor-pointer text-xs font-semibold text-muted">Payment status breakdown</summary>
                <Counts counts={data.payments} entries={PAYMENT_STATUSES} />
              </details>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Best-selling designs" detail="Ranked by units · merchandise value before discounts." action={data.bestsellers.length > 5 && (
              <button type="button" className={actionClass} aria-expanded={showTen} onClick={() => setShowTen(!showTen)}>{showTen ? 'Show top 5' : 'Show top 10'}</button>
            )}>
              {!data.bestsellers.length ? <Empty>No eligible item sales in this period.</Empty> : (
                <ol className="divide-y divide-border">
                  {data.bestsellers.slice(0, showTen ? 10 : 5).map((row, index) => (
                    <li className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0" key={row.product_id}>
                      <span aria-hidden="true" className="w-4 shrink-0 text-center text-xs font-medium tabular-nums text-muted">{index + 1}</span>
                      {row.image
                        ? <img src={row.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-border bg-background object-cover" />
                        : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-background text-muted"><Package size={16} aria-hidden="true" /></span>}
                      <div className="min-w-0 flex-1 break-words">
                        <p className="text-sm font-semibold">{row.name}</p>
                        <p className="text-xs text-muted">
                          {row.editions.map((edition) => edition.edition + ' · ' + number.format(edition.units)).join('  /  ')}
                          {row.edition_count > row.editions.length && '  /  +' + (row.edition_count - row.editions.length) + ' more'}
                        </p>
                      </div>
                      <div className="max-w-[38%] shrink-0 break-words text-right text-xs tabular-nums">
                        <p className="font-semibold text-foreground">{number.format(row.units)} units</p>
                        <p className="text-muted">{formatPrice(row.value)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <QuietDemand items={data.quiet} onInventory={onInventory} />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <InventoryAlerts stock={data.stock} onInventory={onInventory} />
            <Panel title="Edition and size demand" detail="Most ordered editions and sizes in this period.">
              {!data.editions.length && !data.sizes.length ? <Empty>No edition or size demand in this period.</Empty> : (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div>
                    <h4 className="mb-2 border-b border-border pb-2 text-xs font-semibold text-muted">Top editions</h4>
                    <ul className="divide-y divide-border">
                      {data.editions.map((row) => <li key={row.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0 break-words"><p className="font-medium">{row.edition}</p><p className="text-xs text-muted">{row.product}</p></div>
                        <strong className="tabular-nums">{number.format(row.units)}</strong>
                      </li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-2 border-b border-border pb-2 text-xs font-semibold text-muted">Top sizes</h4>
                    <ul className="divide-y divide-border">
                      {data.sizes.map((row) => <li key={row.size} className="flex justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 break-words text-muted">{formatSize(row.size)}</span>
                        <strong className="tabular-nums">{number.format(row.units)}</strong>
                      </li>)}
                    </ul>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Recent orders" detail="Most recent in this period." action={<Action onClick={onOrders}>View orders</Action>}>
              {!data.recent.length ? <Empty>No orders placed in this period.</Empty> : (
                <ul className="divide-y divide-border">
                  {data.recent.map((row) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0" key={row.order_reference}>
                      <div className="min-w-0 break-all"><p className="text-sm font-semibold tabular-nums">{row.order_reference}</p>
                        <p className="text-xs text-muted">{dateLabel.format(new Date(row.created_at))}</p></div>
                      <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                        <span className="font-medium">{formatPrice(row.total)}</span><StatusBadge status={row.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="About these numbers">
              <dl className="space-y-3 text-xs leading-relaxed text-muted">
                <div><dt className="font-semibold text-foreground">Collected revenue</dt><dd>Current paid orders plus legacy delivered COD with pending payment status, grouped by order date. Saved totals include {formatPrice(data.current.shipping)} in shipping and reflect {formatPrice(data.current.discounts)} in discounts. Cancelled, failed and refunded orders are excluded.</dd></div>
                <div><dt className="font-semibold text-foreground">Eligible units and item value</dt><dd>Order-item snapshots exclude cancelled, failed and refunded orders. Item value uses saved unit prices and quantities before order-level discounts and shipping. Edition names come from the catalog.</dd></div>
                <div><dt className="font-semibold text-foreground">Stock and collections</dt><dd>Stock is live at every date range. Low stock means 1–{data.stock.threshold} available in an active edition size. Historical collection assignments are unavailable.</dd></div>
                <div><dt className="font-semibold text-foreground">Awaiting action</dt><dd>Pending, confirmed and packed orders in the selected period, excluding refunds.</dd></div>
              </dl>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
