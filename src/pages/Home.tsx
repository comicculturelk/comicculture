import Hero from '../components/Hero';
import Collections from '../components/Collections';
import WhySection from '../components/WhySection';
import Timeline from '../components/Timeline';
import Gallery from '../components/Gallery';
import Reviews from '../components/Reviews';
import FAQ from '../components/FAQ';
import Contact from '../components/Contact';

export default function Home() {
  return (
    <>
      <Hero />
      <Collections />
      <WhySection />
      <Timeline />
      <Gallery />
      <Reviews />
      <FAQ />
      <Contact />
    </>
  );
}
