import { identityRoutes } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  identityRoutes.revokeSession(req, (await ctx.params).id);
