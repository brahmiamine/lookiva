import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.statusHistory(req, (await ctx.params).id);
