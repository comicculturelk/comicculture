import { useEffect, useState } from 'react';
import Hero from '../components/Hero';
import BrandStory from '../components/BrandStory';
import Collections from '../components/Collections';
import ProductShowcase from '../components/ProductShowcase';
import Reviews from '../components/Reviews';
import SEO from '../components/SEO';
import { useProducts } from '../hooks/useProducts';
import { fetchCollections, type Collection } from '../data/collections';
import { isProductAvailable } from '../data/products';

import { SITE_URL, HOME_TITLE, HOME_DESCRIPTION, STORE_SCHEMA } from '../lib/seo';
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

  // The homepage highlights the newest purchasable designs.
  const newestFirstProducts = [...products].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Additional recommendations remain purchasable and never duplicate arrivals.
  const newArrivals = newestFirstProducts.filter(isProductAvailable).slice(0, NEW_ARRIVALS_COUNT);
  const arrivalIds = new Set(newArrivals.map((product) => product.id));
  const moreToExplore = newestFirstProducts.filter((product) => isProductAvailable(product) && !arrivalIds.has(product.id));
  const showMoreToExplore = !productsLoading && !productsError && moreToExplore.length > 0;

  const collectionsSection = (
    <Collections key="collections"
        collections={collections}
        loading={collectionsLoading}
        error={collectionsError}
      />
  );
  const arrivalsSection = (
    <ProductShowcase key="arrivals"
        sectionId="new-arrivals"
        title="New Arrivals"
        viewAllHref="/shop?sort=newest"
        products={newArrivals}
        loading={productsLoading}
        error={productsError}
      />
  );

  return (
    <>
      <SEO
        title={HOME_TITLE}
        description={HOME_DESCRIPTION}
        canonical={`${SITE_URL}/`}
        ogType="website"
        jsonLd={[{ id: 'store', data: STORE_SCHEMA }, { id: 'website', data: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'ComicCulture', url: `${SITE_URL}/` } }]}
        image={`${SITE_URL}/images/logo/comicculture-logo.png`}
      />
      <Hero collections={collections} products={newestFirstProducts} loading={collectionsLoading || productsLoading} />
      {arrivalsSection}
      <BrandStory />
      {collectionsSection}
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
    </>
  );
}
