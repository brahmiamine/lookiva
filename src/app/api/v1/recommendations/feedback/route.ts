import { recommendationsRoutes } from '@/modules/recommendations';

export const dynamic = 'force-dynamic';

export const POST = recommendationsRoutes.addFeedback;
export const DELETE = recommendationsRoutes.deleteAllFeedback;
