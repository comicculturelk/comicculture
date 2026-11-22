import { createContext, useEffect, useState, type ReactNode } from 'react';

export interface CartItem {
  /**
   * Identifies the exact sellable unit (one size of one product version).
   * This is now the cart line's identity — see loadCart/addItem/removeItem/
   * updateQuantity below. Two different versions of the same product that
   * happen to share a size (e.g. Loki → Jersey → M and
   * Loki → Oversized Cotton → M) have different versionSizeId values and
   * so remain separate cart lines.
   */
  versionSizeId: string;
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  size: string;
  quantity: number;
  /** Available stock for this size at the time it was added, used to cap quantity client-side. */
  maxStock?: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (versionSizeId: string) => void;
  updateQuantity: (versionSizeId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** User-friendly message set when a quantity was capped by available stock. */
  stockMessage: string | null;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = 'comicculture_cart';

/**
 * Narrows unknown parsed JSON down to a valid CartItem. Old (pre Phase 2B)
 * carts stored items keyed by productId+size with no versionSizeId at all —
 * there's no reliable way to infer which version they meant, so those
 * items are discarded rather than guessed at. This also guards against any
 * other malformed/corrupted localStorage content crashing the app on load.
 */
function isValidCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.versionSizeId === 'string' &&
    item.versionSizeId.length > 0 &&
    typeof item.productId === 'string' &&
    typeof item.slug === 'string' &&
    typeof item.name === 'string' &&
    typeof item.image === 'string' &&
    typeof item.price === 'number' &&
    typeof item.size === 'string' &&
    typeof item.quantity === 'number' &&
    item.quantity > 0 &&
    (item.maxStock === undefined || typeof item.maxStock === 'number')
  );
}

function loadCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    // Silently drop anything that isn't a valid, versionSizeId-keyed item —
    // covers both pre-Phase-2B carts and any other malformed data.
    return parsed.filter(isValidCartItem);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());
  const [isOpen, setIsOpen] = useState(false);
  const [stockMessage, setStockMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage may be unavailable (private browsing, etc.) — fail silently
    }
  }, [items]);

  const addItem: CartContextValue['addItem'] = (item, quantity = 1) => {
    const existing = items.find((i) => i.versionSizeId === item.versionSizeId);
    const cap = item.maxStock ?? existing?.maxStock;
    const desiredQty = (existing?.quantity ?? 0) + quantity;
    const cappedQty = cap != null ? Math.min(desiredQty, cap) : desiredQty;

    setStockMessage(
      cap != null && desiredQty > cap
        ? cap > 0
          ? `Only ${cap} left in size ${item.size} — quantity adjusted.`
          : `Sorry, size ${item.size} just sold out.`
        : null
    );

    setItems((prev) => {
      if (existing) {
        return prev.map((i) =>
          i.versionSizeId === item.versionSizeId
            ? { ...i, quantity: cappedQty, maxStock: cap ?? i.maxStock }
            : i
        );
      }
      return [...prev, { ...item, quantity: cappedQty }];
    });
  };

  const removeItem: CartContextValue['removeItem'] = (versionSizeId) => {
    setItems((prev) => prev.filter((i) => i.versionSizeId !== versionSizeId));
  };

  const updateQuantity: CartContextValue['updateQuantity'] = (versionSizeId, quantity) => {
    if (quantity <= 0) {
      removeItem(versionSizeId);
      return;
    }
    const target = items.find((i) => i.versionSizeId === versionSizeId);
    const cap = target?.maxStock;
    const cappedQty = cap != null ? Math.min(quantity, cap) : quantity;

    setStockMessage(
      cap != null && quantity > cap ? `Only ${cap} left in size ${target?.size ?? ''}.` : null
    );

    setItems((prev) =>
      prev.map((i) => (i.versionSizeId === versionSizeId ? { ...i, quantity: cappedQty } : i))
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        isOpen,
        openCart,
        closeCart,
        stockMessage,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
