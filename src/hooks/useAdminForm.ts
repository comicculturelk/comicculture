import { useCallback, useEffect, useRef, useState } from 'react';

export const ADMIN_LEAVE_EVENT = 'comicculture:admin-leave';

/** One guard for explicit admin navigation, Cancel, and browser reloads. */
export function useAdminForm(busy = false) {
  const [dirty, setDirty] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const confirmDiscard = useCallback(() => {
    if (busy) return false;
    return !dirty || window.confirm('Discard your unsaved changes?');
  }, [busy, dirty]);

  useEffect(() => {
    const leave = (event: Event) => { if (!confirmDiscard()) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener(ADMIN_LEAVE_EVENT, leave);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener(ADMIN_LEAVE_EVENT, leave);
      window.removeEventListener('beforeunload', unload);
    };
  }, [busy, dirty, confirmDiscard]);

  return {
    markDirty: () => setDirty(true),
    markSaved: () => setDirty(false),
    confirmDiscard,
    errorRef,
  };
}
