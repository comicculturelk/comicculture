import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Tag,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { createOrder } from '../data/orders';

const DELIVERY_FEE = 350;

const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle',
  'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
  'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Moneragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
  'Trincomalee', 'Vavuniya',
];

interface CheckoutForm {
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  postalCode: string;
}

const EMPTY_FORM: CheckoutForm = {
  fullName: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  district: '',
  postalCode: '',
};

type FormErrors = Partial<Record<keyof CheckoutForm, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s]{9,15}$/;

export default function Checkout() {
  const navigate = useNavigate();
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [promoCode, setPromoCode] = useState('');
  const [promoNote, setPromoNote] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const deliveryFee = items.length > 0 ? DELIVERY_FEE : 0;
  const total = totalPrice + deliveryFee;

  const handleChange = (field: keyof CheckoutForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!form.fullName.trim()) next.fullName = 'Full name is required';
    if (!form.phone.trim()) {
      next.phone = 'Phone number is required';
    } else if (!PHONE_REGEX.test(form.phone.trim())) {
      next.phone = 'Enter a valid phone number';
    }
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (!form.addressLine1.trim()) next.addressLine1 = 'Address is required';
    if (!form.city.trim()) next.city = 'City is required';
    if (!form.district.trim()) next.district = 'District is required';
    return next;
  };

  const handleApplyPromo = (e: FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoNote("Promo codes aren't available just yet — check back soon!");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setIsSubmitting(true);

    const orderReference = `CC-${Date.now().toString().slice(-6)}`;

    try {
      await createOrder({
        orderReference,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email,
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2,
        city: form.city.trim(),
        district: form.district,
        postalCode: form.postalCode,
        subtotal: totalPrice,
        deliveryFee,
        total,
        items,
      });

      clearCart();
      navigate('/order-success', {
        state: {
          orderReference,
          customerName: form.fullName,
          totalItems,
          total,
        },
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Something went wrong placing your order. Please try again.'
      );
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <section className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-background px-6 text-center">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <ShoppingBag className="h-10 w-10 text-muted/30" />
          <p className="text-muted/60">Your cart is empty — add something before checking out.</p>
          <Link to="/shop" className="btn-primary">
            Browse Collection
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen bg-background py-24 lg:py-32">
      <div className="absolute inset-0 bg-web-pattern opacity-10" />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <span>/</span>
          <span className="text-muted">Checkout</span>
        </nav>

        <Link
          to="/shop"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Continue Shopping
        </Link>

        <h1 className="mb-8 font-display text-3xl text-foreground tracking-wide md:text-4xl">
          CHECKOUT
        </h1>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px] lg:items-start"
        >
          {/* Left: customer info, delivery, promo */}
          <motion.div
            className="glass space-y-8 rounded-2xl p-6 lg:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Customer information */}
            <div>
              <h2 className="mb-4 font-display text-xl text-foreground tracking-wide">
                CUSTOMER INFORMATION
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Full Name" required error={errors.fullName}>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    className={inputClass(!!errors.fullName)}
                    placeholder="Peter Parker"
                    autoComplete="name"
                  />
                </FormField>

                <FormField label="Phone Number" required error={errors.phone}>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className={inputClass(!!errors.phone)}
                    placeholder="07X XXX XXXX"
                    autoComplete="tel"
                  />
                </FormField>

                <div className="sm:col-span-2">
                  <FormField label="Email" error={errors.email}>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className={inputClass(!!errors.email)}
                      placeholder="peter@dailybugle.com"
                      autoComplete="email"
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-2">
                  <FormField label="Address Line 1" required error={errors.addressLine1}>
                    <input
                      type="text"
                      value={form.addressLine1}
                      onChange={(e) => handleChange('addressLine1', e.target.value)}
                      className={inputClass(!!errors.addressLine1)}
                      placeholder="House number, street"
                      autoComplete="address-line1"
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-2">
                  <FormField label="Address Line 2">
                    <input
                      type="text"
                      value={form.addressLine2}
                      onChange={(e) => handleChange('addressLine2', e.target.value)}
                      className={inputClass(false)}
                      placeholder="Apartment, suite, unit (optional)"
                      autoComplete="address-line2"
                    />
                  </FormField>
                </div>

                <FormField label="City" required error={errors.city}>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    className={inputClass(!!errors.city)}
                    placeholder="Colombo"
                    autoComplete="address-level2"
                  />
                </FormField>

                <FormField label="District" required error={errors.district}>
                  <select
                    value={form.district}
                    onChange={(e) => handleChange('district', e.target.value)}
                    className={inputClass(!!errors.district)}
                  >
                    <option value="" className="bg-background">
                      Select district
                    </option>
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d} className="bg-background">
                        {d}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Postal Code">
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={(e) => handleChange('postalCode', e.target.value)}
                    className={inputClass(false)}
                    placeholder="10100"
                    autoComplete="postal-code"
                  />
                </FormField>
              </div>
            </div>

            {/* Delivery */}
            <div>
              <h2 className="mb-4 font-display text-xl text-foreground tracking-wide">DELIVERY</h2>
              <div className="flex items-center justify-between rounded-lg border border-primary bg-primary/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Standard Delivery (Islandwide)
                    </p>
                    <p className="text-xs text-muted-foreground">Arrives in 2-4 business days</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">
                    Rs. {DELIVERY_FEE}
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
              </div>
            </div>

            {/* Promo code */}
            <div>
              <h2 className="mb-4 font-display text-xl text-foreground tracking-wide">PROMO CODE</h2>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/30" />
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className={`${inputClass(false)} pl-9`}
                    placeholder="Enter promo code"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  className="btn-outline px-6 py-2.5 text-sm"
                >
                  Apply
                </button>
              </div>
              {promoNote && <p className="mt-2 text-xs text-muted-foreground">{promoNote}</p>}
            </div>
          </motion.div>

          {/* Right: order summary */}
          <motion.div
            className="glass space-y-6 rounded-2xl p-6 lg:sticky lg:top-28 lg:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h2 className="font-display text-xl text-foreground tracking-wide">ORDER SUMMARY</h2>

            <div className="space-y-4">
              {items.map((item) => (
                <div key={`${item.productId}-${item.size}`} className="flex gap-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-background">
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col justify-center">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Size: {item.size} · Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="self-center text-sm font-medium text-muted">
                    Rs. {item.price * item.quantity}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'items'})</span>
                <span>Rs. {totalPrice}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Delivery fee</span>
                <span>Rs. {deliveryFee}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 font-display text-lg text-foreground">
                <span>Total</span>
                <span className="text-primary">Rs. {total}</span>
              </div>
            </div>

            {submitError && (
              <p className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm text-primary">
                {submitError}
              </p>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Placing Order...
                </>
              ) : (
                'Place Order'
              )}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              No payment is collected now — we'll contact you to confirm delivery.
            </p>
          </motion.div>
        </form>
      </div>
    </section>
  );
}

function inputClass(hasError: boolean) {
  return `w-full rounded-lg border bg-surface px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary ${
    hasError ? 'border-primary/60' : 'border-border'
  }`;
}

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-primary">{error}</p>}
    </div>
  );
}
