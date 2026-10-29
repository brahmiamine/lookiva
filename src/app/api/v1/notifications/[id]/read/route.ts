import { notificationsRoutes } from '@/modules/notifications';
export const runtime = 'nodejs';
export const PUT = async (r: Request, c: {
    params: Promise<{
        id: string;
    }>;
}) => notificationsRoutes.read(r, (await c.params).id);
