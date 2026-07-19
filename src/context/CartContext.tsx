import { createContext, useEffect, useState, type ReactNode } from 'react';

export interface CartItem {
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
  removeItem: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
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

function loadCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CartItem[]) : [];
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
    const existing = items.find(
      (i) => i.productId === item.productId && i.size === item.size
    );
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
          i.productId === item.productId && i.size === item.size
            ? { ...i, quantity: cappedQty, maxStock: cap ?? i.maxStock }
            : i
        );
      }
      return [...prev, { ...item, quantity: cappedQty }];
    });
  };

  const removeItem: CartContextValue['removeItem'] = (productId, size) => {
    setItems((prev) => prev.filter((i) => !(i.productId === productId && i.size === size)));
  };

  const updateQuantity: CartContextValue['updateQuantity'] = (productId, size, quantity) => {
    if (quantity <= 0) {
      removeItem(productId, size);
      return;
    }
    const target = items.find((i) => i.productId === productId && i.size === size);
    const cap = target?.maxStock;
    const cappedQty = cap != null ? Math.min(quantity, cap) : quantity;

    setStockMessage(
      cap != null && quantity > cap ? `Only ${cap} left in size ${size}.` : null
    );

    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.size === size ? { ...i, quantity: cappedQty } : i
      )
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
