import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import { useReducedMotion } from 'framer-motion';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';

interface ProductImageViewerProps {
  images: string[];
  index: number;
  productName: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

// Loaded only when opened. Gesture handling, focus and scroll locking belong
// to the lightbox; the product page remains the source of the selected photo.
export default function ProductImageViewer({ images, index, productName, onClose, onIndexChange }: ProductImageViewerProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={images.map((src, imageIndex) => ({ src, alt: `${productName} — image ${imageIndex + 1} of ${images.length}` }))}
      plugins={[Zoom, Counter]}
      on={{ view: ({ index: nextIndex }) => onIndexChange(nextIndex) }}
      controller={{ aria: true, closeOnBackdropClick: true }}
      carousel={{ preload: 1 }}
      zoom={{ maxZoomPixelRatio: 2 }}
      animation={reduceMotion ? { fade: 0, swipe: 0, zoom: 0 } : undefined}
      labels={{ Close: 'Close image viewer', Next: 'Next image', Previous: 'Previous image' }}
    />
  );
}
