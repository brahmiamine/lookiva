import { outfitsRoutes } from '@/modules/outfits';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => outfitsRoutes.conflicts(req, (await ctx.params).id);
