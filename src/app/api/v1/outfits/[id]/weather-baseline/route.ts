import { recommendationsRoutes } from '@/modules/recommendations';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) => recommendationsRoutes.setWeatherBaseline(req, (await ctx.params).id);
