import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { isProductAvailable, type Product } from '../data/products';
import { getProductImages, getProductPriceLabel, getProductSummary, isNewProduct } from '../lib/merchandising';

interface ProductCardProps { product: Product; index: number }

export default function ProductCard({ product }: ProductCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = getProductImages(product);
  const available = isProductAvailable(product);
  return (
    <article className="product-card flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="relative aspect-[4/5] shrink-0 overflow-hidden bg-background">
        <Link to={`/product/${product.slug}`} aria-label={`View ${product.name}`} className="block h-full">
          <img src={images[imageIndex % images.length] || product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        </Link>
        {(!available || isNewProduct(product)) && <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-border bg-white/95 px-2 py-1 text-[10px] font-semibold text-foreground">{available ? 'New' : 'Sold out'}</span>}
        {images.length > 1 && <>
          <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-border bg-white/95 px-2 py-1 text-[10px] tabular-nums text-foreground">{imageIndex + 1}/{images.length}</span>
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
            <button type="button" aria-label={`Previous photo of ${product.name}`} className="icon-button shrink-0 border border-border bg-white/95" onClick={() => setImageIndex((imageIndex - 1 + images.length) % images.length)}><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={`Next photo of ${product.name}`} className="icon-button shrink-0 border border-border bg-white/95" onClick={() => setImageIndex((imageIndex + 1) % images.length)}><ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></button>
          </div>
        </>}
      </div>
      <Link to={`/product/${product.slug}`} className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="truncate text-[10px] font-medium text-muted">{product.collection}</p>
        <h3 className="mt-1 font-display text-lg leading-tight text-foreground sm:text-xl">{product.name}</h3>
        <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{getProductSummary(product)}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-sm font-semibold text-foreground">{getProductPriceLabel(product)}</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        </div>
      </Link>
    </article>
  );
}
