import FAQSection from '../components/FAQ';
import SEO from '../components/SEO';

export default function FAQ() {
  return (
    <>
      <SEO
        title="FAQ | ComicCulture"
        description="Answers to common questions about ordering, delivery, payment methods, sizing, and returns at ComicCulture."
        canonical="https://comicculture.lk/faq"
        ogType="website"
      />
      <FAQSection />
    </>
  );
}
