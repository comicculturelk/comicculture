import { STATIC_SEO } from '../lib/seo';
import ContactSection from '../components/Contact';
import SEO from '../components/SEO';

export default function Contact() {
  return (
    <>
      <SEO
        title={STATIC_SEO['/contact'].title}
        description={STATIC_SEO['/contact'].description}
        canonical="https://comicculture.lk/contact"
        ogType="website"
      />
      <ContactSection />
    </>
  );
}
