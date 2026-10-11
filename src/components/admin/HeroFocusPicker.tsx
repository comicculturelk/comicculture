import { useCallback, useEffect, useRef, useState } from 'react';

interface HeroFocusPickerProps {
  hint: string;
  /** Collection cover image URL, or null to show the empty state. */
  image: string | null;
  /** Current stored object-position value, e.g. "50% center", "70% center", or "50% 30%". */
  value: string;
  /** Called with a CSS object-position value compatible with heroFocusDesktop/heroFocusMobile. */
  onChange: (value: string) => void;
  /** Tailwind aspect-ratio class for the preview box. Ignored (as a shape — kept as a pre-mount fallback) when matchViewportAspect is true. */
  aspectClassName: string;
  /**
   * Track the viewport dimensions for a responsive hero preview. The image
   * panel can occupy less than the full viewport width, supplied below.
   */
  matchViewportAspect?: boolean;
  /** The fraction of the live viewport width occupied by the hero image. */
  viewportWidthFraction?: number;
}

function parsePercent(value: string): [number, number] {
  const parts = value.trim().split(/\s+/);
  const parse = (part: string | undefined) => {
    if (!part || part === 'center') return 50;
    const match = /^(-?\d+(?:\.\d+)?)%$/.exec(part);
    if (!match) return 50;
    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 50;
  };
  return [parse(parts[0]), parse(parts[1])];
}

/**
 * Visual focal-point picker for a collection's hero image. Renders the cover
 * image the same way the real Hero does (object-cover + object-position) in
 * a preview box, and lets the admin drag in either direction or use
 * accessible sliders to adjust the focal point.
 *
 * The preview box is either a fixed Tailwind aspect ratio (representative
 * of a device class we can't literally measure, e.g. mobile) or, with
 * `matchViewportAspect`, an approximation of the real hero image panel's
 * live ratio. The preview is an estimate because the hero has a minimum
 * height and its final height can exceed that on short or narrow screens.
 *
 * The drag is mapped 1:1 to how far the image actually shifts on screen: we
 * measure how much the image overflows the preview box on both axes once
 * scaled to cover it, and convert pointer movement into that same range.
 */
export default function HeroFocusPicker({
  hint,
  image,
  value,
  onChange,
  aspectClassName,
  matchViewportAspect,
  viewportWidthFraction = 1,
}: HeroFocusPickerProps) {
  const [positionX, positionY] = parsePercent(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPercentX: number;
    startPercentY: number;
    overflowPx: { x: number; y: number };
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overflow, setOverflow] = useState({ x: 0, y: 0 });
  const [viewportAspect, setViewportAspect] = useState(
    () => (window.innerWidth * viewportWidthFraction) / Math.min(820, window.innerHeight)
  );

  useEffect(() => {
    if (!matchViewportAspect) return;
    const update = () =>
      setViewportAspect((window.innerWidth * viewportWidthFraction) / Math.min(820, window.innerHeight));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [matchViewportAspect, viewportWidthFraction]);

  const boxStyle = matchViewportAspect ? { aspectRatio: String(viewportAspect) } : undefined;
  const boxClassName = matchViewportAspect ? '' : aspectClassName;

  const computeOverflowPx = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) return { x: 0, y: 0 };
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const scale = Math.max(containerW / img.naturalWidth, containerH / img.naturalHeight);
    return {
      x: Math.max(0, img.naturalWidth * scale - containerW),
      y: Math.max(0, img.naturalHeight * scale - containerH),
    };
  }, []);

  // Re-checks the available crop room. Depends on
  // viewportAspect so it re-runs after a desktop resize actually changes the
  // box's proportions (a fixed-ratio box like mobile's never needs this
  // more than once, since its aspect stays constant regardless of size).
  const updateOverflow = useCallback(() => {
    setOverflow(computeOverflowPx());
  }, [computeOverflowPx]);

  useEffect(() => {
    updateOverflow();
  }, [updateOverflow, viewportAspect]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const overflowPx = computeOverflowPx();
    if (overflowPx.x <= 0 && overflowPx.y <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPercentX: positionX, startPercentY: positionY, overflowPx };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startY, startPercentX, startPercentY, overflowPx } = dragRef.current;
    // Follow the pointer as if the image itself were being dragged.
    const deltaX = overflowPx.x > 0 ? (-(e.clientX - startX) / overflowPx.x) * 100 : 0;
    const deltaY = overflowPx.y > 0 ? (-(e.clientY - startY) / overflowPx.y) * 100 : 0;
    const nextX = Math.min(100, Math.max(0, Math.round(startPercentX + deltaX)));
    const nextY = Math.min(100, Math.max(0, Math.round(startPercentY + deltaY)));
    onChange(`${nextX}% ${nextY}%`);
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
        <span className="text-[11px] text-muted-foreground">{positionX}% · {positionY}%</span>
      </div>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        aria-hidden="true"
        style={boxStyle}
        className={`relative touch-none select-none overflow-hidden rounded-lg border border-border ${
          dragging ? 'cursor-grabbing' : overflow.x > 0 || overflow.y > 0 ? 'cursor-grab' : 'cursor-not-allowed'
        } ${boxClassName}`}
      >
        <img
          ref={imgRef}
          src={image}
          alt=""
          draggable={false}
          onLoad={updateOverflow}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${positionX}% ${positionY}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Horizontal focus <span className="sr-only">{positionX} percent</span>
          <input
            type="range"
            min="0"
            max="100"
            value={positionX}
            disabled={overflow.x <= 0}
            aria-label="Horizontal image focus"
            onChange={(event) => onChange(`${event.target.value}% ${positionY}%`)}
            className="w-full accent-primary disabled:opacity-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Vertical focus <span className="sr-only">{positionY} percent</span>
          <input
            type="range"
            min="0"
            max="100"
            value={positionY}
            disabled={overflow.y <= 0}
            aria-label="Vertical image focus"
            onChange={(event) => onChange(`${positionX}% ${event.target.value}%`)}
            className="w-full accent-primary disabled:opacity-40"
          />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {overflow.x > 0 || overflow.y > 0 ? hint : 'This image fills the preview at this ratio, so there is no crop to adjust.'}
      </p>
    </div>
  );
}
