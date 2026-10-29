import { notFound } from 'next/navigation';

// Any unknown path under a locale renders the localized [locale]/not-found.tsx (inside the locale layout).
export default function CatchAll() {
  notFound();
}
