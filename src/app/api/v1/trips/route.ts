import { planningRoutes } from '@/modules/planning';
export const runtime = 'nodejs';
export const GET = planningRoutes.trips.list;
export const POST = planningRoutes.trips.create;
