import { outfitsRoutes } from '@/modules/outfits';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; garmentId: string }> };

export const PUT = async (req: Request, ctx: Ctx) => {
  const p = await ctx.params;
  return outfitsRoutes.replaceItem(req, p.id, p.garmentId);
};
export const DELETE = async (req: Request, ctx: Ctx) => {
  const p = await ctx.params;
  return outfitsRoutes.removeItem(req, p.id, p.garmentId);
};
