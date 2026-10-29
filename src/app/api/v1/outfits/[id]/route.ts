import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => wardrobeRoutes.getOutfit(req, (await ctx.params).id);
export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) => wardrobeRoutes.updateOutfit(req, (await ctx.params).id);
