import { useState } from 'react';

interface ConfirmActionProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Inline "click once to arm, click again to confirm" action button.
 * Generic by design — reusable anywhere a destructive action needs a
 * lightweight confirm step (product delete now; coupons/banners/reviews later)
 * without pulling in a modal/dialog dependency.
 */
export default function ConfirmAction({
  label,
  confirmLabel = 'Confirm?',
  onConfirm,
  disabled,
  className,
}: ConfirmActionProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{confirmLabel}</span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          disabled={disabled}
          className="rounded-full border border-red-500/40 bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400'
      }
    >
      {label}
    </button>
  );
}
