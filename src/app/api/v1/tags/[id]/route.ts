import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
export const GET = async (req: Request, ctx: Ctx) => wardrobeRoutes.tags.get(req, (await ctx.params).id);
export const PATCH = async (req: Request, ctx: Ctx) => wardrobeRoutes.tags.rename(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: Ctx) => wardrobeRoutes.tags.remove(req, (await ctx.params).id);
