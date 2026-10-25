import ContactSection from '../components/Contact';
import SEO from '../components/SEO';

export default function Contact() {
  return (
    <>
      <SEO
        title="Contact | ComicCulture"
        description="Get in touch with ComicCulture via WhatsApp, Instagram, or email for questions about orders, products, or collaborations."
        canonical="https://comicculture.lk/contact"
        ogType="website"
      />
      <ContactSection />
    </>
  );
}
