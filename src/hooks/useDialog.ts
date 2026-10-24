import { useEffect, useRef, type RefObject } from 'react';

let scrollLocks = 0;
let previousOverflow = '';

/** Shared focus, Escape and scroll behavior for storefront overlays. */
export function useDialog<T extends HTMLElement>(
  open: boolean,
  panel: RefObject<T>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    ) ?? []).filter(element => element.getClientRects().length > 0);
    (focusable()[0] ?? panel.current)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      const outside = !panel.current?.contains(document.activeElement);
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, panel]);
}
