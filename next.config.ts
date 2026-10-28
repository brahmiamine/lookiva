import type { NextConfig } from 'next';

// agentRules: false stops `next dev` from generating a root AGENTS.md (documented option, Next >= 16.3).
const nextConfig: NextConfig = { agentRules: false };

export default nextConfig;
