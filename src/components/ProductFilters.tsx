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

const selectClass = 'comic-field min-h-11 bg-surface px-4 text-sm text-foreground outline-none transition-colors';

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
  const options = (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
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
                <button key={size} type="button" onClick={() => onSizeChange(isActive ? null : size)} aria-pressed={isActive}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 text-xs font-medium transition-colors ${isActive ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground'}`}>
                  {size}
                </button>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => onFeaturedChange(!featuredOnly)} aria-pressed={featuredOnly}
          className={`min-h-11 rounded-lg border px-3.5 text-xs font-medium transition-colors ${featuredOnly ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground'}`}>
          Featured
        </button>
        {onAvailableChange && (
          <button type="button" onClick={() => onAvailableChange(!availableOnly)} aria-pressed={availableOnly}
            className={`min-h-11 rounded-lg border px-3.5 text-xs font-medium transition-colors ${availableOnly ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground'}`}>
            In stock / preorder
          </button>
        )}
        {priceBounds.max > priceBounds.min && (
          <label className="flex min-h-11 flex-1 items-center gap-3 rounded-lg border border-border px-4 sm:max-w-xs">
            <span className="shrink-0 text-xs font-medium text-muted">Up to {formatPrice(priceLimit)}</span>
            <input aria-label="Maximum price" type="range" min={priceBounds.min} max={priceBounds.max} value={priceLimit}
              onChange={(event) => onPriceLimitChange(Number(event.target.value))} className="h-1 min-w-14 flex-1 cursor-pointer accent-primary" />
          </label>
        )}
        {hasActiveFilters && (
          <button type="button" onClick={onReset} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5">
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="product-filters mb-5 space-y-3 sm:mb-8 sm:space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search designs, collections..."
            className="comic-field min-h-11 w-full bg-background py-2.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>

      </div>

      <div className="hidden space-y-4 md:block">{options}</div>
      <details className="rounded-lg border border-border md:hidden">
        <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between">Filter & sort <span className="text-xs font-normal text-muted-foreground">{hasActiveFilters ? 'Filters applied' : 'Optional'}</span></span>
        </summary>
        <div className="space-y-4 border-t border-border p-3">{options}</div>
      </details>
    </div>
  );
}
