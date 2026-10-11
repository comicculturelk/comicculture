import { Pencil, Copy } from 'lucide-react';
import { getProductMinPrice, type Product } from '../../data/products';
import ConfirmAction from './ConfirmAction';

interface ProductListItemProps {
  product: Product;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicating?: boolean;
  deleting?: boolean;
}

/**
 * Unique size labels across a product's active versions. Sizes now live on
 * `ProductVersion` (not directly on `Product`), so this is the new
 * equivalent of the old flat `product.sizes` list.
 */
function getActiveSizes(product: Product): string[] {
  const seen = new Set<string>();
  product.versions
    .filter((v) => v.isActive)
    .forEach((v) => v.sizes.forEach((s) => seen.add(s.size)));
  return Array.from(seen);
}

export default function ProductListItem({
  product,
  onEdit,
  onDuplicate,
  onDelete,
  duplicating,
  deleting,
}: ProductListItemProps) {
  const activeVersionCount = product.versions.filter((v) => v.isActive).length;
  const activeSkuCount = product.versions
    .filter((v) => v.isActive)
    .reduce((sum, v) => sum + v.sizes.length, 0);

  return (
    <div className="glass grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 rounded-2xl p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:p-4">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-background sm:h-16 sm:w-16">
        {product.image && (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-base text-foreground tracking-wide">{product.name}</p>
          {product.featured && (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Featured
            </span>
          )}
        </div>
        <p className="text-xs uppercase tracking-wide text-muted">{product.collection}</p>
        <p className="mt-1 break-all font-mono text-[11px] font-semibold text-foreground">{product.productCode}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeVersionCount} version{activeVersionCount === 1 ? '' : 's'} · {activeSkuCount} SKU
          {activeSkuCount === 1 ? '' : 's'}
        </p>
      </div>

      <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-auto">
        {getActiveSizes(product).map((size) => (
          <span
            key={size}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            {size}
          </span>
        ))}
      </div>

      <p className="col-span-2 font-display text-lg text-foreground sm:col-auto">Rs. {getProductMinPrice(product)}</p>

      <div className="col-span-2 flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:flex-none"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={duplicating}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50 sm:flex-none"
        >
          <Copy className="h-3.5 w-3.5" />
          {duplicating ? 'Duplicating...' : 'Duplicate'}
        </button>
        <ConfirmAction label="Delete" onConfirm={onDelete} disabled={deleting} />
      </div>
    </div>
  );
}
