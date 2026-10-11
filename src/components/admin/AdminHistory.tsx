import { useEffect, useState } from 'react';
import {
  fetchInventoryMovements,
  type InventoryMovement,
  type MovementType,
} from '../../data/inventory';
import { formatDate } from '../../lib/admin';
import { listAdminActivity, type AdminActivity } from '../../data/admin';

const PAGE_SIZE = 25;

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

export default function AdminHistory() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | MovementType>('all');
  const [view, setView] = useState<'inventory' | 'admin'>('inventory');
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [inventoryHasMore, setInventoryHasMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchInventoryMovements({ ...(typeFilter === 'all' ? {} : { changeType: typeFilter }), limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((rows) => { setMovements(rows); setInventoryHasMore(rows.length === PAGE_SIZE); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [typeFilter, page]);

  useEffect(() => {
    if (view !== 'admin') return;
    let cancelled = false;
    setLoading(true);
    listAdminActivity(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .then((rows) => { if (!cancelled) { setActivity(rows); setHasMore(rows.length === PAGE_SIZE); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load admin activity'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, view]);

  return (
    <div>
      <div className="mb-5 flex gap-2"><button type="button" onClick={() => { setPage(0); setView('inventory'); }} className={`btn-outline text-xs ${view === 'inventory' ? 'border-primary text-primary' : ''}`}>Inventory movements</button><button type="button" onClick={() => { setPage(0); setView('admin'); }} className={`btn-outline text-xs ${view === 'admin' ? 'border-primary text-primary' : ''}`}>Admin activity</button></div>
      {view === 'inventory' && <>
      <div className="admin-filter-row mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter inventory history by movement type">
        {(['all', 'sale', 'restock', 'adjustment', 'cancellation'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setPage(0); setTypeFilter(t); }}
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
      <div className="mt-5 flex items-center justify-between"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn-outline text-xs disabled:opacity-50">Previous</button><span className="text-xs text-muted-foreground">Page {page + 1}</span><button type="button" disabled={!inventoryHasMore || loading} onClick={() => setPage((value) => value + 1)} className="btn-outline text-xs disabled:opacity-50">Next</button></div>
      </>}
      {view === 'admin' && <>
        {loading && <p className="text-muted-foreground">Loading admin activity…</p>}
        {!loading && activity.length === 0 && <p className="text-sm text-muted-foreground">No admin changes have been logged yet. New actions are recorded from the time audit logging is enabled.</p>}
        <div className="space-y-3">{activity.map((entry) => <article key={entry.id} className="glass rounded-xl p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-foreground">{entry.event_type.replace(/_/g, ' ')}</p><time className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</time></div><p className="mt-1 text-xs text-muted-foreground">{entry.actor_email ?? 'Former admin'} · {entry.entity_type} {entry.entity_id}</p>{entry.note && <p className="mt-2 text-sm text-muted-foreground">{entry.note}</p>}<details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Show recorded change</summary><pre className="mt-2 overflow-auto rounded bg-background p-3 text-muted-foreground">{JSON.stringify({ before: entry.before_data, after: entry.after_data }, null, 2)}</pre></details></article>)}</div>
        <div className="mt-5 flex items-center justify-between"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn-outline text-xs disabled:opacity-50">Previous</button><span className="text-xs text-muted-foreground">Page {page + 1}</span><button type="button" disabled={!hasMore || loading} onClick={() => setPage((value) => value + 1)} className="btn-outline text-xs disabled:opacity-50">Next</button></div>
      </>}
    </div>
  );
}
