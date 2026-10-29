import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.updateCustomSubcategory(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.deleteCustomSubcategory(req, (await ctx.params).id);
