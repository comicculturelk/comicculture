import { STATIC_SEO } from '../lib/seo';
import WhySection from '../components/WhySection';
import Timeline from '../components/Timeline';
import SEO from '../components/SEO';

export default function About() {
  return (
    <>
      <SEO
        title={STATIC_SEO['/about'].title}
        description={STATIC_SEO['/about'].description}
        canonical="https://comicculture.lk/about"
        ogType="website"
      />
      {/* Visually hidden — WhySection/Timeline each lead with their own
          styled heading; this gives the page exactly one real, crawlable
          H1 without duplicating or restyling the existing visual design. */}
      <h1 className="sr-only">About ComicCulture</h1>
      <WhySection />
      <Timeline />
    </>
  );
}
