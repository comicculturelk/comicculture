import { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, RefreshCw } from 'lucide-react';
import { ADMIN_PERIODS, type AdminPeriod } from '../../lib/adminPeriods';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

const stages = [
  ['viewed', 'Viewed a product'], ['added', 'Added to cart'],
  ['started', 'Started checkout'], ['purchased', 'Placed an order'],
] as const;

type Counts = Record<typeof stages[number][0], number>;
type Device = 'mobile' | 'desktop' | 'unknown';
type Report = Counts & {
  start: string;
  end: string;
  attributed_orders: number;
  devices: (Counts & { device: Device })[];
  products: { product_id: string; product_name: string; views: number; adds: number }[];
};

const number = new Intl.NumberFormat('en-LK');
const percent = new Intl.NumberFormat('en-LK', { style: 'percent', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' });
const panel = 'min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5';
const deviceLabel: Record<Device, string> = { mobile: 'Mobile-size', desktop: 'Desktop-size', unknown: 'Unknown' };
const rate = (count: number, total: number) => total ? percent.format(count / total) : '—';

function Funnel({ report }: { report: Report }) {
  return (
    <section className={panel} aria-labelledby="funnel-title">
      <h3 id="funnel-title" className="text-lg font-semibold">Conversion funnel</h3>
      <p className="mt-1 text-sm text-muted">Each stage counts unique sessions that reached it after the preceding stage.</p>
      <ol className="mt-5 space-y-5">
        {stages.map(([key, label], index) => {
          const count = report[key];
          const previous = index ? report[stages[index - 1][0]] : 0;
          return (
            <li key={key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">{label}</span>
                <strong className="tabular-nums">{number.format(count)}</strong>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-3 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: report.viewed ? (100 * count / report.viewed) + '%' : '0%' }} />
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                <span>{rate(count, report.viewed)} of viewing sessions</span>
                {index > 0 && previous > 0 && <span>{rate(previous - count, previous)} drop-off from prior stage</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function AdminConversion() {
  const [period, setPeriod] = useState<AdminPeriod>('30d');
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ period: AdminPeriod; report?: Report; failed?: boolean } | null>(null);
  const current = loaded?.period === period ? loaded : null;
  const report = current?.report;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabaseAdmin.rpc('admin_checkout_conversion', { p_period: period }).abortSignal(controller.signal);
        if (!controller.signal.aborted) setLoaded(error || !data ? { period, failed: true } : { period, report: data as Report });
      } catch {
        if (!controller.signal.aborted) setLoaded({ period, failed: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [period, refresh]);

  const retry = () => { setLoaded(null); setRefresh(value => value + 1); };
  return (
    <div className="space-y-5" aria-busy={!current}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">Checkout conversion</h2>
          <p className="mt-1 text-sm text-muted">Where opted-in browsing sessions progress or leave.</p>
        </div>
        <button type="button" className="btn-outline inline-flex items-center gap-2 text-xs" onClick={retry} disabled={!current}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Conversion period" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
          {ADMIN_PERIODS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}
              className={'rounded-md px-2 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-primary ' +
                (period === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground')}>
              {key === 'all' ? 'All retained' : label}
            </button>
          ))}
        </div>
        {report && <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <CalendarDays size={15} aria-hidden="true" /> {date.format(new Date(report.start))}
          {report.end !== report.start && ' – ' + date.format(new Date(report.end))} · Asia/Colombo
        </p>}
      </div>
      {!current && <p role="status" className={panel + ' text-sm text-muted'}>Loading conversion report…</p>}
      {current?.failed && <div role="alert" className={panel + ' flex flex-wrap items-center justify-between gap-3 text-sm'}>
        Could not load the conversion report. <button type="button" className="text-primary underline" onClick={retry}>Try again</button>
      </div>}
      {report && <>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Conversion metrics">
          {[
            ['Viewing sessions', number.format(report.viewed), 'Unique opted-in sessions with a product view'],
            ['Session conversion', rate(report.purchased, report.viewed), 'Viewing sessions that completed all four stages'],
            ['Attributed orders', number.format(report.attributed_orders), 'Successful orders linked to an opted-in session'],
          ].map(([label, value, help]) => <div className={panel} key={label}>
            <p className="text-sm font-semibold">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{help}</p>
          </div>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {report.viewed > 0 ? <Funnel report={report} /> : <section className={panel}>
            <BarChart3 className="mb-3 text-muted" aria-hidden="true" />
            <h3 className="text-lg font-semibold">No tracked product views</h3>
            <p className="mt-1 text-sm text-muted">This period has no sessions that can form the start of a conversion funnel.</p>
          </section>}
          <section className={panel} aria-labelledby="device-title">
            <h3 id="device-title" className="text-lg font-semibold">Conversion by screen size</h3>
            <p className="mt-1 text-sm text-muted">Grouped by browser window width at the start of each tracked session.</p>
            <div className="mt-4 space-y-3">
              {report.devices.filter(device => device.device !== 'unknown' || device.viewed > 0).map(device => (
                <div className="rounded-lg border border-border bg-background p-3" key={device.device}>
                  <div className="flex flex-wrap justify-between gap-1 text-sm font-semibold">
                    <span>{deviceLabel[device.device]}</span><span>{rate(device.purchased, device.viewed)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{number.format(device.viewed)} viewed · {number.format(device.added)} added · {number.format(device.started)} started · {number.format(device.purchased)} ordered</p>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className={panel} aria-labelledby="product-activity-title">
          <h3 id="product-activity-title" className="text-lg font-semibold">Product activity</h3>
          <p className="mt-1 text-sm text-muted">Up to 12 designs by views. Each session counts once per product and activity.</p>
          {report.products.length ? <table className="mt-3 w-full table-fixed text-left text-sm">
            <thead><tr className="border-b border-border text-xs text-muted">
              <th className="w-1/2 pb-2">Design</th><th className="pb-2 text-right">Views</th><th className="pb-2 text-right">Cart adds</th>
            </tr></thead>
            <tbody>{report.products.map(product => <tr className="border-b border-border last:border-0" key={product.product_id}>
              <th scope="row" className="break-words py-2.5 pr-2 font-medium">{product.product_name}</th>
              <td className="py-2.5 text-right tabular-nums">{number.format(product.views)}</td>
              <td className="py-2.5 text-right tabular-nums">{number.format(product.adds)}</td>
            </tr>)}</tbody>
          </table> : <p className="mt-3 text-sm text-muted">No product activity in this period.</p>}
        </section>
        <p className="text-xs leading-relaxed text-muted">
          The funnel groups sessions by their first product view in the selected Colombo dates and counts subsequent activity within that session.
          Sessions last up to 24 hours and reports retain up to 90 days. Attributed orders use their placement date and can include sessions with missing funnel steps.
          Order placement includes bank transfers awaiting verification. It is separate from paid revenue and total store orders.
        </p>
      </>}
    </div>
  );
}
