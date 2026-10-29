import { notificationsRoutes } from '@/modules/notifications';
export const runtime = 'nodejs';
export const GET = notificationsRoutes.getPreferences;
export const PUT = notificationsRoutes.setPreferences;
