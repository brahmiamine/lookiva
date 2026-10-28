import { identityRoutes } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export const PUT = async (req: Request, ctx: { params: Promise<{ kind: string }> }) =>
  identityRoutes.setConsent(req, (await ctx.params).kind);
