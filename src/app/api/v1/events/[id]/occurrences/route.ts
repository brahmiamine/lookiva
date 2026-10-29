import { planningRoutes } from '@/modules/planning';
export const runtime = 'nodejs';
export const GET = async (r: Request, c: {
    params: Promise<{
        id: string;
    }>;
}) => planningRoutes.occurrences(r, (await c.params).id);
