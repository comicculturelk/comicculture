import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRestockReview, type RestockReview } from '../../data/inventory';

const refreshTime = new Intl.DateTimeFormat('en-LK', {
  timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short',
});

const groups = [
  { label: '2 or more orders', min: 2 },
  { label: '1 order', min: 1 },
  { label: 'No orders', min: 0 },
];

export default function AdminRestockReview({
  visible, stockRevision, onAccessLost,
}: {
  visible: boolean;
  stockRevision: number;
  onAccessLost: () => void;
}) {
  const [report, setReport] = useState<RestockReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController>();
  const lastStockRevision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await fetchRestockReview(controller.signal);
      if (controller.signal.aborted) return;
      if (result === 'access-denied') {
        setReport(null);
        onAccessLost();
        return;
      }
      setReport(result);
      setFailed(false);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [onAccessLost]);

  useEffect(() => {
    const stockChanged = lastStockRevision.current !== stockRevision;
    lastStockRevision.current = stockRevision;
    if (visible || stockChanged) void refresh();
  }, [visible, stockRevision, refresh]);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (visible) heading.current?.focus();
  }, [visible]);

  return (
    <section hidden={!visible} aria-labelledby="restock-review-heading" className="space-y-4">
      <div className="glass space-y-3 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="restock-review-heading" ref={heading} tabIndex={-1} className="font-display text-2xl text-foreground">Restock Review</h2>
          <button ref={refreshButton} type="button" className="btn-outline min-h-11 text-sm" onClick={() => void refresh()}>Refresh</button>
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">
          Review active, regular edition-sizes with 0–3 available units. Counts show distinct eligible orders placed in the last 90 days.
          Stockouts and gaps in order history can hide demand.
        </p>
        {report && <p className="text-xs text-muted-foreground">Last refreshed {refreshTime.format(new Date(report.as_of))} · Sri Lanka time</p>}
      </div>

      <div role="status" className="text-sm text-muted-foreground">
        {loading ? report ? 'Refreshing restock review…' : 'Loading restock review…' : null}
      </div>
      {failed && (
        <div role="alert" className="glass flex flex-wrap items-center gap-3 rounded-xl p-4 text-sm">
          <p>Could not load restock review.{report && ' Showing the last successful review.'}</p>
          <button type="button" className="btn-outline min-h-11" onClick={() => {
            refreshButton.current?.focus();
            void refresh();
          }}>Retry</button>
        </div>
      )}
      {report && !failed && report.candidates.length === 0 && (
        <p className="glass rounded-xl p-4 text-sm text-muted-foreground">No edition-sizes need review.</p>
      )}
      {report && groups.map(({ label, min }) => {
        const candidates = report.candidates.filter((item) => Math.min(item.order_count, 2) === min);
        if (!candidates.length) return null;
        return (
          <section key={min} aria-labelledby={`restock-group-${min}`} className="glass rounded-2xl p-4 sm:p-6">
            <h3 id={`restock-group-${min}`} className="mb-2 font-display text-lg text-foreground">{label}</h3>
            <ul role="list" className="divide-y divide-border">
              {candidates.map((item) => (
                <li key={item.edition_size_id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
                  <div className="min-w-0 break-words">
                    <p className="font-semibold text-foreground">{item.product}</p>
                    <p className="text-sm text-muted-foreground">{item.edition} · {item.size} · {item.sku}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:flex-col sm:gap-1">
                    <span>{item.stock} available</span>
                    <span>{item.order_count} {item.order_count === 1 ? 'order' : 'orders'}</span>
                    <span className={item.stock === 0 ? 'text-red-400' : 'text-yellow-400'}>
                      {item.stock === 0 ? 'Out of stock' : 'Low stock'}
                    </span>
                    {item.order_count === 0 && <span className="text-muted-foreground">Limited evidence</span>}
                  </div>
                  <Link
                    className="btn-outline min-h-11 justify-self-start text-sm"
                    to={`?section=inventory&stock=${item.edition_size_id}`}
                    aria-label={`Open stock controls for ${item.product}, ${item.edition}, ${item.size}, SKU ${item.sku}`}
                  >
                    Stock controls
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
