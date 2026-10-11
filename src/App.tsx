import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoadingScreen from './components/LoadingScreen';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CartDrawer from './components/CartDrawer';
import ScrollToTop from './components/ScrollToTop';
import { CartProvider } from './context/CartContext';
import CollectionPage from './pages/CollectionPage';
import NotFound from './pages/NotFound';

const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const Product = lazy(() => import('./pages/Product'));
const About = lazy(() => import('./pages/About'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Contact = lazy(() => import('./pages/Contact'));
const Checkout = lazy(() => import('./pages/Checkout'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const ReturnPolicy = lazy(() => import('./pages/ReturnPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));
const Admin = lazy(() => import('./pages/Admin'));

export default function App() {
  return (
    <CartProvider>
      <ScrollToTop />
      <LoadingScreen />
      <Navbar />
      <main>
        <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading page…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:slug" element={<Product />} />
            <Route path="/collections/:slug" element={<CollectionPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-success" element={<OrderSuccess />} />
            <Route path="/track-order" element={<TrackOrder />} />
            <Route path="/return-policy" element={<ReturnPolicy />} />
            <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
