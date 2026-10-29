import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.changeStatus(req, (await ctx.params).id);
