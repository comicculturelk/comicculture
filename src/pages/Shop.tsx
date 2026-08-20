import Collections from '../components/Collections';
import SEO from '../components/SEO';

export default function Shop() {
  return (
    <>
      <SEO
        title="Shop | ComicCulture"
        description="Browse ComicCulture's fan-inspired apparel collections — premium designs inspired by comics, superheroes, and pop culture."
        canonical="https://comicculture.lk/shop"
        ogType="website"
      />
      {/* Visually hidden — Collections already leads with its own styled
          heading; this gives the page exactly one real, crawlable H1
          without duplicating or restyling the existing visual design. */}
      <h1 className="sr-only">Shop All Collections</h1>
      <Collections />
    </>
  );
}
