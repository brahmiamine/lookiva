import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request, ctx: { params: Promise<{ id: string; photoId: string }> }) => {
  const p = await ctx.params;
  return wardrobeRoutes.cutoutPhoto(req, p.id, p.photoId);
};
