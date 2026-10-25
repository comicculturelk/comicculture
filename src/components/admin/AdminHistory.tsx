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

function activitySummary(entry: AdminActivity): string {
  const before = entry.before_data ?? {};
  const after = entry.after_data ?? {};
  const name = after.name ?? before.name ?? after.version_name ?? before.version_name ?? after.sku ?? before.sku ?? after.code ?? before.code ?? after.customer_name ?? before.customer_name;
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !['id', 'updated_at', 'created_at'].includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const labels = changed.slice(0, 6).map((key) => key.replace(/_/g, ' ')).join(', ');
  return [typeof name === 'string' ? name : '', labels ? `Changed: ${labels}${changed.length > 6 ? ', and more' : ''}` : 'Details recorded below'].filter(Boolean).join(' - ');
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

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        if (view === 'inventory') {
          const rows = await fetchInventoryMovements({ ...(typeFilter === 'all' ? {} : { changeType: typeFilter }), limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE });
          if (!cancelled) { setMovements(rows.slice(0, PAGE_SIZE)); setInventoryHasMore(rows.length > PAGE_SIZE); }
        } else {
          const rows = await listAdminActivity(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
          if (!cancelled) { setActivity(rows.slice(0, PAGE_SIZE)); setHasMore(rows.length > PAGE_SIZE); }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [typeFilter, page, view, retry]);

  return (
    <div>
      <div className="mb-5 flex gap-2"><button type="button" onClick={() => { setPage(0); setView('inventory'); }} className={`btn-outline text-xs ${view === 'inventory' ? 'border-primary text-primary' : ''}`}>Inventory movements</button><button type="button" onClick={() => { setPage(0); setView('admin'); }} className={`btn-outline text-xs ${view === 'admin' ? 'border-primary text-primary' : ''}`}>Admin activity</button></div>
      {error && <div role="alert" className="mb-4 text-sm text-primary">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Retry</button></div>}
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
      {!loading && !error && movements.length === 0 && (
        <p className="text-muted">No inventory movements match this filter.</p>
      )}

      <div className="space-y-3">
        {!loading && !error && movements.map((m) => (
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
        {!loading && !error && activity.length === 0 && <p className="text-sm text-muted-foreground">No admin changes have been logged yet. New actions are recorded from the time audit logging is enabled.</p>}
        <div className="space-y-3">{!loading && !error && activity.map((entry) => <article key={entry.id} className="glass rounded-xl p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-foreground">{entry.event_type.replace(/_/g, ' ')}</p><time className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</time></div><p className="mt-1 text-xs text-muted-foreground">{activitySummary(entry)}</p><p className="mt-1 text-xs text-muted-foreground">{entry.actor_email ?? 'Former admin'} · {entry.entity_type} {entry.entity_id}</p>{entry.note && <p className="mt-2 text-sm text-muted-foreground">{entry.note}</p>}<details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Show recorded change</summary><pre className="mt-2 overflow-auto rounded bg-background p-3 text-muted-foreground">{JSON.stringify({ before: entry.before_data, after: entry.after_data }, null, 2)}</pre></details></article>)}</div>
        <div className="mt-5 flex items-center justify-between"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn-outline text-xs disabled:opacity-50">Previous</button><span className="text-xs text-muted-foreground">Page {page + 1}</span><button type="button" disabled={!hasMore || loading} onClick={() => setPage((value) => value + 1)} className="btn-outline text-xs disabled:opacity-50">Next</button></div>
      </>}
    </div>
  );
}
