// Next calls register() once per server start, before the server accepts requests (src/ convention, Next 16).
// A bad environment must stop startup with the secret-free EnvError message instead of failing on the first request.
export async function register(): Promise<void> {
  // The build (`next build`, page-data collection) has no runtime env; the edge runtime has no Node env module.
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { validateEnvAtStartup } = await import('./instrumentation.node');
  validateEnvAtStartup();
}
