import { execFileSync } from 'node:child_process';

// Applies the versioned migrations to the e2e database (the .env.example URL, see playwright.config.ts) before the
// suite. Needs `pnpm infra:up` (MariaDB on 127.0.0.1:3307, Redis on 6380); fails loudly otherwise.
export default async function globalSetup(): Promise<void> {
  const DATABASE_URL = process.env.E2E_DATABASE_URL;
  if (!DATABASE_URL) throw new Error('E2E_DATABASE_URL is set by playwright.config.ts');
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL }, stdio: 'inherit' });
  } catch {
    throw new Error('e2e: cannot apply migrations. Is the infra up? Run `pnpm infra:up` first (MariaDB 3307, Redis 6380).');
  }
  await warmUp();
}

// `next dev` compiles a route on its first request and rewrites shared manifests while doing so; many first
// requests at once (parallel workers) have made a request read a half-written manifest ("Unexpected end of JSON
// input"). The web server is already up here (Playwright starts it before globalSetup): compile the routes one by one.
const ID = '00000000-0000-4000-8000-000000000000';
const WARM = [
  '/fr/login', '/fr/register', '/fr/verify-email', '/fr/forgot-password', '/fr/reset-password', '/fr/onboarding',
  '/fr/settings/profile', '/fr/settings/sessions',
  '/fr/dressing', '/fr/dressing/new', '/fr/dressing/trash', '/fr/dressing/organize', `/fr/dressing/${ID}`, `/fr/dressing/${ID}/edit`,
  '/api/v1/me', '/api/v1/me/preferences', '/api/v1/catalog/categories', '/api/v1/catalog/colors', '/api/v1/catalog/options',
  '/api/v1/custom-subcategories', '/api/v1/garments', '/api/v1/garments/trash', `/api/v1/garments/${ID}`, `/api/v1/garments/${ID}/photos`,
  `/api/v1/garments/${ID}/photos/${ID}/file`, `/api/v1/garments/${ID}/status-history`, '/api/v1/tags', '/api/v1/collections', '/api/v1/garment-sets',
  `/api/v1/tags/${ID}`, `/api/v1/tags/${ID}/garments`, `/api/v1/tags/${ID}/garments/${ID}`, `/api/v1/garments/${ID}/duplicate`, `/api/v1/garments/${ID}/status`,
  `/api/v1/garments/${ID}/restore`, '/api/v1/garments/bulk-actions', `/api/v1/garments/${ID}/photos/${ID}`, `/api/v1/garments/${ID}/photos/${ID}/primary`,
  `/api/v1/garments/${ID}/photos/${ID}/cutout`, '/fr/tenues', '/fr/tenues/new', '/fr/tenues/modeles', `/fr/tenues/${ID}`, '/api/v1/outfits', `/api/v1/outfits/${ID}`,
  `/api/v1/outfits/${ID}/items`, `/api/v1/outfits/${ID}/items/${ID}`, `/api/v1/outfits/${ID}/conflicts`, `/api/v1/outfits/${ID}/confirm-worn`, `/api/v1/outfits/${ID}/save-as-template`,
  '/api/v1/outfits/last-worn', '/api/v1/outfit-templates', `/api/v1/outfit-templates/${ID}`, `/api/v1/outfit-templates/${ID}/instantiate`, `/api/v1/wear-records/${ID}`,
  `/api/v1/wear-records/${ID}/mark-to-wash`, `/api/v1/wear-records/${ID}/invalidate`, `/api/v1/garments/${ID}/wear-history`, '/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/email/verify', '/api/v1/me/onboarding',
];
async function warmUp(): Promise<void> {
  for (const path of WARM) await fetch(`http://localhost:3100${path}`, { redirect: 'manual' }).catch(() => undefined);
}
