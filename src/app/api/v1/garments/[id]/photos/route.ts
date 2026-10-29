import { wardrobeRoutes } from '@/modules/wardrobe';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => wardrobeRoutes.listPhotos(req, (await ctx.params).id);
export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) => wardrobeRoutes.uploadPhoto(req, (await ctx.params).id);
