'use client';
import { useEffect } from 'react';

// Sets <html data-hydrated> once React has hydrated: e2e tests wait for it before interacting (see e2e/support.ts).
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}
