import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string; photoId: string }> }) => {
  const p = await ctx.params;
  return wardrobeRoutes.photoFile(req, p.id, p.photoId);
};
