import { planningRoutes } from '@/modules/planning';
export const runtime = 'nodejs';
type C = {
    params: Promise<{
        id: string;
    }>;
};
export const GET = async (r: Request, c: C) => planningRoutes.trips.get(r, (await c.params).id);
export const PUT = async (r: Request, c: C) => planningRoutes.trips.update(r, (await c.params).id);
export const DELETE = async (r: Request, c: C) => planningRoutes.trips.remove(r, (await c.params).id);
