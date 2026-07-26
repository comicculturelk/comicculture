import { useEffect, useState } from 'react';
import {
  fetchInventoryMovements,
  type InventoryMovement,
  type MovementType,
} from '../../data/inventory';
import { formatDate } from '../../pages/Admin';

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
