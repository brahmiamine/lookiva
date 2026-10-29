import { notificationsRoutes } from '@/modules/notifications';
export const runtime = 'nodejs';
export const DELETE = async (r: Request, c: {
    params: Promise<{
        id: string;
    }>;
}) => notificationsRoutes.dismiss(r, (await c.params).id);
