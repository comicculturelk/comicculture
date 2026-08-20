import Hero from '../components/Hero';
import BrandStory from '../components/BrandStory';
import Universe from '../components/Collections';
import ProductShowcase from '../components/ProductShowcase';
import Reviews from '../components/Reviews';
import FinalCTA from '../components/FinalCTA';
import SEO from '../components/SEO';

const SITE_URL = 'https://comicculture.lk';

export default function Home() {
  return (
    <>
      <SEO
        title="ComicCulture — Wear Your Universe | Premium Fan Apparel"
        description="ComicCulture is a Sri Lankan fan-apparel brand creating premium clothing inspired by comics, superheroes, fictional universes, and fandoms. Explore unique designs and high-quality apparel made for fans."
        canonical={`${SITE_URL}/`}
        ogType="website"
        image={`${SITE_URL}/images/logo/comicculture-logo.png`}
      />
      <Hero />
      <ProductShowcase />
      <Universe />
      <BrandStory />
      <Reviews />
      <FinalCTA />
    </>
  );
}
