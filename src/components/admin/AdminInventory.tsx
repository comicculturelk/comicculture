import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { fetchProducts, type Product } from '../../data/products';
import {
  restockProduct,
  adjustStock,
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
} from '../../data/inventory';
import { LOW_STOCK_THRESHOLD } from '../../lib/admin';
import AdminRestockReview from './AdminRestockReview';

/**
 * A stock action targets one product_version_sizes row directly — the
 * versionSizeId is the actual inventory identifier now, since the same
 * size (e.g. "M") can exist on more than one version of the same product
 * with independent stock.
 */
type StockAction = { versionSizeId: string; kind: 'restock' | 'adjust' } | null;

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
    if (!Number.isInteger(qty) || qty === 0 || (action.kind === 'restock' && qty < 1)) {
      setError(action.kind === 'restock' ? 'Enter a positive whole number to restock.' : 'Enter a non-zero whole number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (action.kind === 'restock') {
        await restockProduct(action.versionSizeId, qty, note.trim() || undefined);
      } else {
        await adjustStock(action.versionSizeId, qty, reason, note.trim() || undefined);
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
          min={action.kind === 'restock' ? 1 : undefined}
          step="1"
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

const reviewPath = '?section=inventory&inventory=restock-review';
const stockPath = '?section=inventory';

export default function AdminInventory({ onAccessLost }: { onAccessLost: () => void }) {
  const [params, setParams] = useSearchParams();
  const showReview = params.get('inventory') === 'restock-review';
  const stockTarget = showReview ? null : params.get('stock');
  const [catalog, setCatalog] = useState<{ products: Product[]; target: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<StockAction>(null);
  const [search, setSearch] = useState('');

  const [stockRevision, setStockRevision] = useState(0);
  const catalogRequest = useRef(0);
  const lastFocusedTarget = useRef<string | null>(null);

  const loadProducts = useCallback(async () => {
    const request = ++catalogRequest.current;
    setLoading(true);
    setError(null);
    try {
      const products = await fetchProducts();
      if (request === catalogRequest.current) setCatalog({ products, target: stockTarget });
    } catch (err) {
      if (request === catalogRequest.current) {
        setError(err instanceof Error ? err.message : 'Failed to load products');
      }
    } finally {
      if (request === catalogRequest.current) setLoading(false);
    }
  }, [stockTarget]);

  useEffect(() => {
    if (!showReview) void loadProducts();
    return () => { catalogRequest.current += 1; };
  }, [loadProducts, showReview, stockRevision]);

  useEffect(() => {
    setActiveAction(null);
    lastFocusedTarget.current = null;
  }, [showReview, stockTarget]);

  const handleAccessLost = useCallback(() => {
    setParams({ section: 'inventory' }, { replace: true });
    onAccessLost();
  }, [onAccessLost, setParams]);

  const handleDone = (completedAction: NonNullable<StockAction>) => {
    setActiveAction((action) => action === completedAction ? null : action);
    setStockRevision((revision) => revision + 1);
  };

  const catalogMatchesTarget = catalog?.target === stockTarget;
  const products = catalogMatchesTarget ? catalog.products : [];
  const awaitingTarget = !error && !catalogMatchesTarget;
  const targetProduct = stockTarget && products.find((product) =>
    product.versions.some((version) => version.sizes.some((size) => size.id === stockTarget)));

  useEffect(() => {
    if (!showReview && stockTarget && lastFocusedTarget.current !== stockTarget && targetProduct && !loading && !error) {
      document.getElementById(`inventory-size-${stockTarget}`)?.focus();
      lastFocusedTarget.current = stockTarget;
    }
  }, [showReview, stockTarget, targetProduct, loading, error]);

  const visibleProducts = products.filter((product) => product === targetProduct
    || `${product.name} ${product.collection} ${product.versions.flatMap((version) => `${version.versionName} ${version.sizes.map((size) => size.sku).join(' ')}`).join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <div className="space-y-4">
      <nav aria-label="Inventory views" className="flex flex-wrap gap-2">
        <Link to={stockPath} aria-current={!showReview ? 'page' : undefined}
          className={!showReview ? 'btn-primary min-h-11 text-sm' : 'btn-outline min-h-11 text-sm'}>Stock levels</Link>
        <Link to={reviewPath} aria-current={showReview ? 'page' : undefined}
          className={showReview ? 'btn-primary min-h-11 text-sm' : 'btn-outline min-h-11 text-sm'}>Restock Review</Link>
      </nav>
      <AdminRestockReview visible={showReview} stockRevision={stockRevision} onAccessLost={handleAccessLost} />
      {!showReview && (loading || awaitingTarget) && (
        <p role="status" className="text-muted-foreground">
          {awaitingTarget ? 'Loading products…' : 'Refreshing stock levels…'}
        </p>
      )}
      {!showReview && !awaitingTarget && <>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-primary">
        <p>{error}</p>
        <button type="button" className="btn-outline" onClick={() => void loadProducts()}>Retry loading stock</button>
      </div>}
      {stockTarget && !error && !targetProduct && (
        <div role="alert" className="glass flex flex-wrap items-center gap-3 rounded-xl p-4 text-sm">
          <p>Stock controls for this edition-size are unavailable.</p>
          <Link to={reviewPath} className="btn-outline">Back to Restock Review</Link>
        </div>
      )}
      <label className="relative block max-w-xl text-xs text-muted-foreground"><Search className="absolute left-3 top-[2.1rem] h-4 w-4" /><span>Search inventory by product, edition, or SKU</span><input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground" /></label>
      {!error && visibleProducts.length === 0 && <p className="text-sm text-muted-foreground">No matching inventory.</p>}
      {visibleProducts.map((product) => (
        <div key={product.id} className="glass rounded-2xl p-6">
          <p className="font-display text-lg text-foreground tracking-wide">{product.name}</p>
          {product.versions.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">No versions set up yet.</p>
          )}
          <div className="mt-4 space-y-5">
            {product.versions.map((version) => (
              <div key={version.id}>
                {product.versions.length > 1 && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {version.versionName}
                  </p>
                )}
                <div className="space-y-3">
                  {version.sizes.map((sizeRow) => {
                    const qty = sizeRow.stock;
                    const state = stockState(qty);
                    const isActive =
                      activeAction?.versionSizeId === sizeRow.id;
                    return (
                      <div
                        key={sizeRow.id}
                        id={`inventory-size-${sizeRow.id}`}
                        role="group"
                        aria-label={`Stock controls for ${product.name}, ${version.versionName}, ${sizeRow.size}, SKU ${sizeRow.sku}`}
                        tabIndex={sizeRow.id === stockTarget ? -1 : undefined}
                        className={`scroll-mt-6 border-b border-border pb-3 last:border-0 last:pb-0 ${sizeRow.id === stockTarget
                          ? 'rounded-lg outline outline-2 outline-offset-4 outline-primary' : ''}`}
                      >
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="flex min-w-[7rem] flex-col text-xs font-medium uppercase tracking-wide text-muted">
                            <span>{sizeRow.size}</span>
                            <span className="mt-0.5 break-all font-mono text-[9px] normal-case text-muted-foreground">{sizeRow.sku}</span>
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
                                    : { versionSizeId: sizeRow.id, kind: 'restock' }
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
                                    : { versionSizeId: sizeRow.id, kind: 'adjust' }
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
                            key={`${activeAction.versionSizeId}:${activeAction.kind}`}
                            action={activeAction}
                            onCancel={() => setActiveAction(null)}
                            onDone={() => handleDone(activeAction)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      </>}
    </div>
  );
}
