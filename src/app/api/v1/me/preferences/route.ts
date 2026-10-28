import { identityRoutes } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export const GET = identityRoutes.getPreferences;
export const PATCH = identityRoutes.updatePreferences;
