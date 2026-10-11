import { Search, X } from 'lucide-react';
import { formatPrice, type ProductSort } from '../data/products';

interface ProductFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  sizes: string[];
  selectedSize: string | null;
  onSizeChange: (size: string | null) => void;
  priceBounds: { min: number; max: number };
  priceLimit: number;
  onPriceLimitChange: (value: number) => void;
  featuredOnly: boolean;
  onFeaturedChange: (value: boolean) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  sort?: ProductSort;
  onSortChange?: (value: ProductSort) => void;
  collections?: string[];
  selectedCollection?: string | null;
  onCollectionChange?: (value: string | null) => void;
  availableOnly?: boolean;
  onAvailableChange?: (value: boolean) => void;
}

const selectClass = 'min-h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors focus:border-primary';

export default function ProductFilters({
  search,
  onSearchChange,
  sizes,
  selectedSize,
  onSizeChange,
  priceBounds,
  priceLimit,
  onPriceLimitChange,
  featuredOnly,
  onFeaturedChange,
  onReset,
  hasActiveFilters,
  sort,
  onSortChange,
  collections,
  selectedCollection,
  onCollectionChange,
  availableOnly = false,
  onAvailableChange,
}: ProductFiltersProps) {
  return (
    <div className="mb-8 space-y-4 rounded-2xl border border-border bg-surface/70 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search designs, collections..."
            className="min-h-11 w-full rounded-full border border-border bg-background py-2.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>

        {collections && onCollectionChange && (
          <label>
            <span className="sr-only">Filter by collection</span>
            <select value={selectedCollection ?? ''} onChange={(event) => onCollectionChange(event.target.value || null)} className={`${selectClass} w-full`}>
              <option value="">All collections</option>
              {collections.map((collection) => <option key={collection} value={collection}>{collection}</option>)}
            </select>
          </label>
        )}

        {sort && onSortChange && (
          <label>
            <span className="sr-only">Sort products</span>
            <select value={sort} onChange={(event) => onSortChange(event.target.value as ProductSort)} className={`${selectClass} w-full`}>
              <option value="recommended">Recommended</option>
              <option value="newest">Newest</option>
              <option value="price-ascending">Price: low to high</option>
              <option value="price-descending">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {sizes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Filter by size">
            {sizes.map((size) => {
              const isActive = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onSizeChange(isActive ? null : size)}
                  aria-pressed={isActive}
                  className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-xs font-semibold uppercase tracking-wide transition-colors ${isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted hover:border-primary/50 hover:text-foreground'}`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => onFeaturedChange(!featuredOnly)}
          aria-pressed={featuredOnly}
          className={`min-h-10 rounded-full border px-3.5 text-xs font-semibold uppercase tracking-wide transition-colors ${featuredOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted hover:border-primary/50 hover:text-foreground'}`}
        >
          Featured
        </button>

        {onAvailableChange && (
          <button
            type="button"
            onClick={() => onAvailableChange(!availableOnly)}
            aria-pressed={availableOnly}
            className={`min-h-10 rounded-full border px-3.5 text-xs font-semibold uppercase tracking-wide transition-colors ${availableOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted hover:border-primary/50 hover:text-foreground'}`}
          >
            In stock / preorder
          </button>
        )}

        {priceBounds.max > priceBounds.min && (
          <label className="flex min-h-10 flex-1 items-center gap-3 rounded-full border border-border bg-background px-4 sm:max-w-xs">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">Up to {formatPrice(priceLimit)}</span>
            <input
              aria-label="Maximum price"
              type="range"
              min={priceBounds.min}
              max={priceBounds.max}
              value={priceLimit}
              onChange={(event) => onPriceLimitChange(Number(event.target.value))}
              className="h-1 min-w-14 flex-1 cursor-pointer accent-primary"
            />
          </label>
        )}

        {hasActiveFilters && (
          <button type="button" onClick={onReset} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/10">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
