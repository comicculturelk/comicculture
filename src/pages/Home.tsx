import { useEffect, useState } from 'react';
import Hero from '../components/Hero';
import BrandStory from '../components/BrandStory';
import Collections from '../components/Collections';
import ProductShowcase from '../components/ProductShowcase';
import Reviews from '../components/Reviews';
import FinalCTA from '../components/FinalCTA';
import SEO from '../components/SEO';
import { useProducts } from '../hooks/useProducts';
import { fetchCollections, type Collection } from '../data/collections';
import { isProductAvailable } from '../data/products';

const SITE_URL = 'https://comicculture.lk';
const NEW_ARRIVALS_COUNT = 4;

export default function Home() {
  const { products, loading: productsLoading, error: productsError } = useProducts();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCollections()
      .then((data) => {
        if (!cancelled) {
          setCollections(data);
          setCollectionsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setCollectionsError(err.message);
          setCollectionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep homepage merchandising newest-first without changing the shop's
  // default product order.
  const newestFirstProducts = [...products].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Keep the new-arrivals section small and purchasable; put every other
  // active catalog item in the separate discovery section without duplicates.
  const newArrivals = newestFirstProducts.filter(isProductAvailable).slice(0, NEW_ARRIVALS_COUNT);
  const arrivalIds = new Set(newArrivals.map((product) => product.id));
  const moreToExplore = newestFirstProducts.filter((product) => !arrivalIds.has(product.id));
  const showMoreToExplore = !productsLoading && !productsError && moreToExplore.length > 0;

  return (
    <>
      <SEO
        title="ComicCulture — Wear Your Universe | Premium Fan Apparel"
        description="ComicCulture is a Sri Lankan fan-apparel brand creating premium clothing inspired by comics, superheroes, fictional universes, and fandoms. Explore unique designs and high-quality apparel made for fans."
        canonical={`${SITE_URL}/`}
        ogType="website"
        image={`${SITE_URL}/images/logo/comicculture-logo.png`}
      />
      <Hero collections={collections} loading={collectionsLoading} />
      <Collections
        collections={collections}
        loading={collectionsLoading}
        error={collectionsError}
      />
      <ProductShowcase
        sectionId="new-arrivals"
        title="New Arrivals"
        viewAllHref="/shop?sort=newest"
        products={newArrivals}
        loading={productsLoading}
        error={productsError}
      />
      <BrandStory />
      {showMoreToExplore && (
        <ProductShowcase
          sectionId="more-to-explore"
          title="More To Explore"
          viewAllHref="/shop"
          products={moreToExplore}
          loading={false}
          error={null}
        />
      )}
      <Reviews />
      <FinalCTA />
    </>
  );
}
