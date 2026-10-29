import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string; photoId: string }> }) => {
  const p = await ctx.params;
  return wardrobeRoutes.deletePhoto(req, p.id, p.photoId);
};
