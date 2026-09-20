import { useCallback, useEffect, useRef, useState } from 'react';

interface HeroFocusPickerProps {
  hint: string;
  /** Collection cover image URL, or null to show the empty state. */
  image: string | null;
  /** Current stored object-position value, e.g. "50% center" or "70% center". Legacy/invalid values fall back to centered. */
  value: string;
  /** Called with a new "<percent>% center" value compatible with heroFocusDesktop/heroFocusMobile. */
  onChange: (value: string) => void;
  /** Tailwind aspect-ratio class for the preview box. Ignored (as a shape — kept as a pre-mount fallback) when matchViewportAspect is true. */
  aspectClassName: string;
  /**
   * The real Hero is a full-viewport `min-h-screen` section, so its
   * rendered proportions are normally close to the browser window's own
   * width/height ratio. This is an approximation, not a pixel-perfect
   * match: `min-h-screen` only sets a *minimum* height, so the section can
   * render taller than the viewport if its content ever needs more room.
   * Still, tracking the window's live ratio is far closer to reality than
   * any fixed guess — whether an image crops horizontally or vertically
   * genuinely depends on the viewer's window shape (a maximized wide
   * monitor mostly crops vertically; a narrower/taller window crops the
   * same image horizontally instead).
   */
  matchViewportAspect?: boolean;
}

/** Reads the horizontal percentage out of a stored object-position string. */
function parsePercent(value: string): number {
  const match = /^(-?\d+(?:\.\d+)?)%/.exec(value.trim());
  if (!match) return 50;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
}

/**
 * Visual focal-point picker for a collection's hero image. Renders the cover
 * image the same way the real Hero does (object-cover + object-position) in
 * a preview box, and lets the admin drag left/right to change the
 * horizontal focus instead of typing a percentage.
 *
 * The preview box is either a fixed Tailwind aspect ratio (representative
 * of a device class we can't literally measure, e.g. mobile) or, with
 * `matchViewportAspect`, an approximation of the admin's own live window
 * ratio (closer to reality for desktop, since the real Hero's container is
 * a full-viewport section — see the prop doc for the caveat).
 *
 * The drag is mapped 1:1 to how far the image actually shifts on screen: we
 * measure how much the image overflows the preview box once scaled to
 * cover it, and convert pointer movement into that same range. If the image
 * doesn't overflow horizontally at this aspect ratio (it's being cropped
 * vertically instead), there is no left/right seam to move — dragging is
 * disabled and the UI says so, rather than silently doing nothing.
 */
export default function HeroFocusPicker({
  hint,
  image,
  value,
  onChange,
  aspectClassName,
  matchViewportAspect,
}: HeroFocusPickerProps) {
  const percent = parsePercent(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startPercent: number; overflowPx: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const [canDrag, setCanDrag] = useState(true);
  const [viewportAspect, setViewportAspect] = useState(
    () => window.innerWidth / window.innerHeight
  );

  useEffect(() => {
    if (!matchViewportAspect) return;
    const update = () => setViewportAspect(window.innerWidth / window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [matchViewportAspect]);

  const boxStyle = matchViewportAspect ? { aspectRatio: String(viewportAspect) } : undefined;
  const boxClassName = matchViewportAspect ? '' : aspectClassName;

  const computeOverflowPx = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) return 0;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerW / containerH;
    // Image is relatively taller/narrower than the box: object-cover scales
    // it to match width, overflow (and cropping) happens vertically instead.
    if (imgAspect <= containerAspect) return 0;
    const scaledWidth = containerH * imgAspect;
    return scaledWidth - containerW;
  }, []);

  // Re-checks whether there's any horizontal room to drag. Depends on
  // viewportAspect so it re-runs after a desktop resize actually changes the
  // box's proportions (a fixed-ratio box like mobile's never needs this
  // more than once, since its aspect stays constant regardless of size).
  const updateCanDrag = useCallback(() => {
    setCanDrag(computeOverflowPx() > 0);
  }, [computeOverflowPx]);

  useEffect(() => {
    updateCanDrag();
  }, [updateCanDrag, viewportAspect]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const overflowPx = computeOverflowPx();
    if (overflowPx <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startPercent: percent, overflowPx };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startPercent, overflowPx } = dragRef.current;
    // Dragging right reveals more of the image's left side, so it should
    // decrease the position percentage — hence the negation.
    const deltaPercent = (-(e.clientX - startX) / overflowPx) * 100;
    const next = Math.min(100, Math.max(0, Math.round(startPercent + deltaPercent)));
    onChange(`${next}% center`);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  if (!image) {
    return (
      <div
        style={boxStyle}
        className={`flex items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-xs text-muted-foreground ${boxClassName}`}
      >
        Upload a cover image first
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-end">
        <span className="text-[11px] text-muted-foreground">{percent}%</span>
      </div>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        aria-disabled={!canDrag}
        style={boxStyle}
        className={`relative touch-none select-none overflow-hidden rounded-lg border border-border ${
          dragging ? 'cursor-grabbing' : canDrag ? 'cursor-grab' : 'cursor-not-allowed'
        } ${boxClassName}`}
      >
        <img
          ref={imgRef}
          src={image}
          alt=""
          draggable={false}
          onLoad={updateCanDrag}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${percent}% center` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {canDrag ? hint : 'No horizontal room to crop at this preview ratio — nothing to drag.'}
      </p>
    </div>
  );
}
