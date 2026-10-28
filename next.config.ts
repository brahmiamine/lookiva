import type { NextConfig } from 'next';

// agentRules: false stops `next dev` from generating a root AGENTS.md (documented option, Next >= 16.3).
// output: 'standalone' emits a self-contained server (.next/standalone) for the Docker `web` target.
const nextConfig: NextConfig = { agentRules: false, output: 'standalone' };

export default nextConfig;
