import { recommendationsRoutes } from '@/modules/recommendations';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => recommendationsRoutes.weatherImpact(req, (await ctx.params).id);
