import { outfitsRoutes } from '@/modules/outfits';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (req: Request, ctx: Ctx) => outfitsRoutes.getOutfit(req, (await ctx.params).id);
export const PATCH = async (req: Request, ctx: Ctx) => outfitsRoutes.patchOutfit(req, (await ctx.params).id);
export const DELETE = async (req: Request, ctx: Ctx) => outfitsRoutes.cancelOutfit(req, (await ctx.params).id);
