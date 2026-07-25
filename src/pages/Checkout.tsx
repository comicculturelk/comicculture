import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Tag,
  Loader2,
  ShoppingBag,
  Wallet,
  Landmark,
  Info,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { createOrder } from '../data/orders';
import { uploadFile } from '../lib/storage';

const RECEIPT_MAX_BYTES = 5 * 1024 * 1024; // 5MB

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

type PaymentMethod = 'COD' | 'BANK_TRANSFER';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s]{9,15}$/;

export default function Checkout() {
  const navigate = useNavigate();
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [promoCode, setPromoCode] = useState('');
  const [promoNote, setPromoNote] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  // Delivery is already included in the product price — no separate fee.
  const deliveryFee = 0;
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

  const handleReceiptChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setReceiptError('Please upload an image of your receipt (JPG, PNG, etc.)');
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setReceiptError('Receipt image must be under 5MB');
      return;
    }

    setReceiptError(null);
    setReceiptPath(null);
    setReceiptFileName(file.name);
    setReceiptUploading(true);

    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { path: uploadedPath } = await uploadFile('payment-receipts', path, file, 'private');
      setReceiptPath(uploadedPath);
    } catch (err) {
      setReceiptError(
        err instanceof Error ? err.message : 'Failed to upload receipt. Please try again.'
      );
      setReceiptFileName(null);
    } finally {
      setReceiptUploading(false);
    }
  };

  const handleApplyPromo = (e: FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoNote("Promo codes aren't available just yet — check back soon!");
  };

  // Bank Transfer requires a successfully uploaded receipt before the order
  // can be placed at all — there's no "place now, upload later" path.
  const receiptRequired = paymentMethod === 'BANK_TRANSFER';
  const receiptBlocksSubmit = receiptRequired && (receiptUploading || !receiptPath);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (receiptBlocksSubmit) return;

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
        paymentMethod,
        receiptPath: receiptPath ?? undefined,
      });

      clearCart();
      navigate('/order-success', {
        state: {
          orderReference,
          customerName: form.fullName,
          totalItems,
          total,
          paymentMethod,
          // OrderSuccess.tsx should check this and render "Payment
          // Verification Required" instead of "Order Confirmed" for
          // Bank Transfer orders — see note in chat reply.
          requiresPaymentVerification: paymentMethod === 'BANK_TRANSFER',
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
                  <span className="text-sm font-medium text-primary">FREE</span>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div>
              <h2 className="mb-4 font-display text-xl text-foreground tracking-wide">
                PAYMENT METHOD
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('COD')}
                  className={paymentOptionClass(paymentMethod === 'COD')}
                >
                  <Wallet className="h-5 w-5 flex-shrink-0 text-primary" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">Cash on Delivery</p>
                    <p className="text-xs text-muted-foreground">Pay in cash when it arrives</p>
                  </div>
                  {paymentMethod === 'COD' && (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('BANK_TRANSFER')}
                  className={paymentOptionClass(paymentMethod === 'BANK_TRANSFER')}
                >
                  <Landmark className="h-5 w-5 flex-shrink-0 text-primary" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">Bank Transfer</p>
                    <p className="text-xs text-muted-foreground">Transfer &amp; submit receipt</p>
                  </div>
                  {paymentMethod === 'BANK_TRANSFER' && (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                  )}
                </button>
              </div>

              {paymentMethod === 'COD' && (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <p className="text-sm text-muted-foreground">Pay when your order arrives.</p>
                </div>
              )}

              {paymentMethod === 'BANK_TRANSFER' && (
                <div className="mt-4 space-y-4 rounded-lg border border-border bg-surface px-4 py-4">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Complete your payment using bank transfer. After transferring the amount,
                      you will be able to submit your payment receipt in the next step.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Bank Name</p>
                      <p className="font-medium text-foreground">Sampath Bank</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Account Name</p>
                      <p className="font-medium text-foreground">ComicCulture (Pvt) Ltd</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Account Number</p>
                      <p className="font-medium text-foreground">0001 2345 6789</p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Payment Receipt <span className="text-primary">*</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40">
                      <Upload className="h-4 w-4 flex-shrink-0" />
                      {receiptFileName ?? 'Choose receipt image (JPG, PNG — max 5MB)'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptChange}
                        className="hidden"
                      />
                    </label>

                    {receiptUploading && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading receipt...
                      </p>
                    )}
                    {receiptError && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        {receiptError}
                      </p>
                    )}
                    {receiptPath && !receiptUploading && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        Receipt uploaded — ready to submit
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                <span>Delivery</span>
                <span className="font-medium text-primary">FREE</span>
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

            <button
              type="submit"
              disabled={isSubmitting || receiptBlocksSubmit}
              className="btn-primary w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Placing Order...
                </>
              ) : (
                'Place Order'
              )}
            </button>
            {receiptRequired && !receiptPath && !isSubmitting && (
              <p className="text-center text-xs text-muted-foreground">
                Upload your payment receipt above to place this order.
              </p>
            )}
            {!receiptRequired && (
              <p className="text-center text-xs text-muted-foreground">
                No payment is collected now — we'll contact you to confirm delivery.
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              By placing your order, you agree to our{' '}
              <Link to="/return-policy" className="text-primary transition-colors hover:underline">
                Return &amp; Exchange Policy
              </Link>
              .
            </p>
          </motion.div>
        </form>
      </div>
    </section>
  );
}

function paymentOptionClass(active: boolean) {
  return `flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
    active
      ? 'border-primary bg-primary/20'
      : 'border-border bg-surface hover:border-primary/40'
  }`;
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
