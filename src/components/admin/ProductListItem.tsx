import { Pencil, Copy } from 'lucide-react';
import type { Product } from '../../data/products';
import ConfirmAction from './ConfirmAction';

interface ProductListItemProps {
  product: Product;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicating?: boolean;
  deleting?: boolean;
}

export default function ProductListItem({
  product,
  onEdit,
  onDuplicate,
  onDelete,
  duplicating,
  deleting,
}: ProductListItemProps) {
  return (
    <div className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-background">
        {product.image && (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-[160px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-base text-foreground tracking-wide">{product.name}</p>
          {product.featured && (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Featured
            </span>
          )}
        </div>
        <p className="text-xs uppercase tracking-wide text-muted">{product.collection}</p>
        <p className="mt-1 text-xs text-muted-foreground">SKU: {product.sku}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {product.sizes.map((size) => (
          <span
            key={size}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            {size}
          </span>
        ))}
      </div>

      <p className="font-display text-lg text-foreground">Rs. {product.price}</p>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={duplicating}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" />
          {duplicating ? 'Duplicating...' : 'Duplicate'}
        </button>
        <ConfirmAction label="Delete" onConfirm={onDelete} disabled={deleting} />
      </div>
    </div>
  );
}
