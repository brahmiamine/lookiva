import { planningRoutes } from '@/modules/planning';
export const runtime = 'nodejs';
export const GET = planningRoutes.events.list;
export const POST = planningRoutes.events.create;
