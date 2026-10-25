import { STATIC_SEO } from '../lib/seo';
import FAQSection from '../components/FAQ';
import SEO from '../components/SEO';

export default function FAQ() {
  return (
    <>
      <SEO
        title={STATIC_SEO['/faq'].title}
        description={STATIC_SEO['/faq'].description}
        canonical="https://comicculture.lk/faq"
        ogType="website"
      />
      <FAQSection />
    </>
  );
}
