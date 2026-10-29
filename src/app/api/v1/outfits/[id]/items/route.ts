import { outfitsRoutes } from '@/modules/outfits';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) => outfitsRoutes.addItem(req, (await ctx.params).id);
