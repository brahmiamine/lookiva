import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string; garmentId: string }> }) => {
  const { id, garmentId } = await ctx.params;
  return wardrobeRoutes.collections.detach(req, id, garmentId);
};
