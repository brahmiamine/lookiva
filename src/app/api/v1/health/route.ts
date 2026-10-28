import { withApi } from '@/platform/http/with-api';

export const dynamic = 'force-dynamic';

// Liveness only: no dependency access.
export const GET = withApi(async () => Response.json({ status: 'ok' }));
