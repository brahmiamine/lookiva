import { identityRoutes } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export const POST = identityRoutes.requestDeletion;
export const DELETE = identityRoutes.cancelDeletion;
