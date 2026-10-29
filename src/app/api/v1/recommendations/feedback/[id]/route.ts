import { recommendationsRoutes } from '@/modules/recommendations';

export const dynamic = 'force-dynamic';

export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string }> }) => recommendationsRoutes.deleteFeedback(req, (await ctx.params).id);
