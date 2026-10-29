import { identityRoutes } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export const POST = identityRoutes.requestExport;
export const GET = identityRoutes.listExportRequests;
