import { useEffect, useState, type FormEvent } from 'react';
import { PackagePlus, SlidersHorizontal } from 'lucide-react';
import { fetchProducts, getStockForSize, type Product } from '../../data/products';
import {
  restockProduct,
  adjustStock,
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
} from '../../data/inventory';
import { LOW_STOCK_THRESHOLD } from '../../pages/Admin';

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

export default function AdminInventory() {
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
