import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.getGarment(req, (await ctx.params).id);
export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.updateGarment(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  wardrobeRoutes.deleteGarment(req, (await ctx.params).id);
