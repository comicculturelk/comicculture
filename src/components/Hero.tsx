import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Collection } from '../data/collections';
import { formatPrice, getProductMinPrice, isProductAvailable, type Product } from '../data/products';
import { FEATURED_LAUNCH } from '../config/merchandising';
import { getProductImages, getProductSummary, isNewProduct } from '../lib/merchandising';

interface HeroProps { collections: Collection[]; products: Product[]; loading?: boolean }

export default function Hero({ collections, products, loading = false }: HeroProps) {
  const [index, setIndex] = useState(0);
  const available = products.filter(isProductAvailable);
  const launch = [...available].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).find((product) => product.featured)
    ?? available.find((product) => product.slug === FEATURED_LAUNCH.productSlug) ?? available[0];
  const otherCollections = collections.filter((collection) => collection.status === 'live'
    && collection.coverImage && collection.id !== launch?.collectionId
    && available.some((product) => product.collectionId === collection.id));
  const slides = [
    ...(launch ? [{
      key: launch.id, title: launch.name,
      label: isNewProduct(launch) ? 'New drop' : 'Featured design',
      summary: launch.slug === FEATURED_LAUNCH.productSlug ? FEATURED_LAUNCH.summary : getProductSummary(launch),
      image: launch.image,
      detail: launch.slug === FEATURED_LAUNCH.productSlug && FEATURED_LAUNCH.detailImageIndex !== undefined
        ? getProductImages(launch)[FEATURED_LAUNCH.detailImageIndex] : undefined,
      price: formatPrice(getProductMinPrice(launch)), href: `/product/${launch.slug}`, cta: 'Explore this design',
    }] : []),
    ...otherCollections.map((collection) => {
      const designs = available.filter((product) => product.collectionId === collection.id);
      return { key: collection.id, title: collection.name, label: 'Explore the collection',
        summary: collection.description || `${designs.length} available ${designs.length === 1 ? 'design' : 'designs'} to explore.`,
        image: designs[0]?.image || collection.coverImage, detail: undefined, price: '',
        href: designs.length === 1 ? `/product/${designs[0].slug}` : `/collections/${collection.slug}`, cta: 'Explore the designs' };
    }),
  ];
  const currentIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const current = slides[currentIndex];
  return (
    <section id="home" className="launch-hero border-b border-border bg-surface">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 pb-8 pt-20 sm:px-6 sm:pb-12 sm:pt-24 md:grid-cols-2 md:gap-8 lg:gap-12 lg:py-28">
        <div className="launch-visual relative overflow-hidden rounded-2xl bg-background md:order-2">
          {current?.image ? <img src={current.image} alt={`${current.title} on a model`} {...{ fetchpriority: 'high' }} className="aspect-[4/3] w-full object-cover object-top sm:aspect-[5/4]" />
            : <div aria-busy={loading} className="aspect-[4/3] bg-surface-hover" />}
          {current?.detail && <div className="absolute bottom-3 right-3 w-20 overflow-hidden rounded-xl border-2 border-white bg-black shadow-sm sm:w-24 lg:w-32">
            <img src={current.detail} alt={FEATURED_LAUNCH.detailLabel ?? 'Product detail'} className="aspect-square w-full object-cover" />
            <p className="px-2 py-1.5 text-center text-[10px] font-medium text-white">{FEATURED_LAUNCH.detailCaption ?? 'Detail'}</p>
          </div>}
        </div>
        <div className="min-w-0 md:order-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{loading && !current ? 'ComicCulture' : current?.label ?? 'Wear your universe'}</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">{current?.title ?? 'Fan culture, made for every day.'}</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">{current?.summary ?? 'Explore fan-inspired T-shirts and jerseys from Sri Lanka.'}</p>
          {current?.price && <p className="mt-4 text-lg font-semibold text-foreground">{current.price}</p>}
          <Link to={current?.href ?? '/shop'} className="btn-primary mt-5 min-h-12">{current?.cta ?? 'Browse all designs'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          {slides.length > 1 && <div className="mt-5 flex max-w-xs items-center justify-between gap-4">
            <p role="status" className="text-xs tabular-nums text-muted">{currentIndex + 1} / {slides.length} · Featured collections</p>
            <div className="flex gap-2">
              <button type="button" aria-label="Previous campaign" className="icon-button border border-border" onClick={() => setIndex((currentIndex - 1 + slides.length) % slides.length)}><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
              <button type="button" aria-label="Next campaign" className="icon-button border border-border" onClick={() => setIndex((currentIndex + 1) % slides.length)}><ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
            </div>
          </div>}
        </div>
      </div>
    </section>
  );
}
