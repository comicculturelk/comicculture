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

const SITE_URL = 'https://comicculture.lk';
const NEW_ARRIVALS_COUNT = 8;

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

  // "New Arrivals" is simply the first slice of the existing product feed.
  // "More To Explore" uses whatever is left over so we never show the same
  // products twice; if there isn't enough inventory for a second distinct
  // set, we fall back to items already flagged `featured` in the data, and
  // if even that yields nothing, the section is hidden rather than faking
  // a second row of the same products.
  const newArrivals = products.slice(0, NEW_ARRIVALS_COUNT);
  const remaining = products.slice(NEW_ARRIVALS_COUNT);
  const moreToExplore = remaining.length > 0 ? remaining : products.filter((p) => p.featured);
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
      <Hero collections={collections} />
      <Collections
        collections={collections}
        loading={collectionsLoading}
        error={collectionsError}
      />
      <ProductShowcase
        sectionId="new-arrivals"
        title="New Arrivals"
        viewAllHref="/shop"
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
