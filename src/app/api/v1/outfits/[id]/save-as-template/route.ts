import { outfitsRoutes } from '@/modules/outfits';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) => outfitsRoutes.saveAsTemplate(req, (await ctx.params).id);
