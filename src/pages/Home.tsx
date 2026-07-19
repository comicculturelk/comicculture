import Hero from '../components/Hero';
import BrandStory from '../components/BrandStory';
import Universe from '../components/Collections';
import ProductShowcase from '../components/ProductShowcase';
import Reviews from '../components/Reviews';
import FinalCTA from '../components/FinalCTA';
import FAQ from '../components/FAQ';
import Contact from '../components/Contact';

export default function Home() {
  return (
    <>
      <Hero />
      <BrandStory />
      <Universe />
      <ProductShowcase />
      <Reviews />
      <FinalCTA />
      <FAQ />
      <Contact />
    </>
  );
}
