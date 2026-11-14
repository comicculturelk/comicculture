import { useEffect, useState } from 'react';
import { fetchDeliveryFee } from '../data/delivery';

export function useDeliveryFee(enabled = true) {
  const [fee, setFee] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setFee(null);
    setFailed(false);
    fetchDeliveryFee(controller.signal).then((amount) => {
      if (!controller.signal.aborted) setFee(amount);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [enabled, attempt]);

  const refresh = () => {
    setFee(null);
    setFailed(false);
    setAttempt((value) => value + 1);
  };
  return { fee, failed, refresh };
}
