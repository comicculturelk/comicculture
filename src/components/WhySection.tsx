import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { isProductAvailable, sortProducts } from '../data/products';

export default function WhySection() {
  const { products } = useProducts();
  const examples = sortProducts(products, 'recommended').filter(isProductAvailable).slice(0, 2);
  return <section id="about" className="mx-auto max-w-6xl px-4 pb-10 pt-24 sm:px-6 sm:pb-16">
    <div className="max-w-2xl">
      <h2 className="font-display text-4xl leading-tight sm:text-5xl">Fan culture, made for every day.</h2>
      <p className="mt-4 text-base leading-relaxed text-muted">Based in Colombo, Sri Lanka, ComicCulture makes apparel inspired by the comics and pop culture fans love. Explore T-shirts and jerseys, discover the artwork, and find the fit that works for you.</p>
      <Link to="/shop" className="btn-primary mt-5">Explore available designs</Link>
    </div>
    {examples.length > 0 && <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6">
      {examples.map((product) => <Link key={product.id} to={`/product/${product.slug}`} className="overflow-hidden rounded-xl border border-border bg-surface">
        <img src={product.image} alt={`${product.name} worn on a model`} loading="lazy" className="aspect-[4/5] w-full object-cover" />
        <p className="p-3 text-sm font-semibold">{product.name}</p>
      </Link>)}
    </div>}
    <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">See each product for its material, available sizes, care details and current stock. Need help choosing? <Link to="/contact" className="font-semibold text-primary underline underline-offset-4">Talk to us.</Link></p>
  </section>;
}
