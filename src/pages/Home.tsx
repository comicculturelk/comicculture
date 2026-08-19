import Hero from '../components/Hero';
import BrandStory from '../components/BrandStory';
import Universe from '../components/Collections';
import ProductShowcase from '../components/ProductShowcase';
import Reviews from '../components/Reviews';
import FinalCTA from '../components/FinalCTA';

export default function Home() {
  return (
    <>
      <Hero />
      <ProductShowcase />
      <Universe />
      <BrandStory />
      <Reviews />
      <FinalCTA />
    </>
  );
}
