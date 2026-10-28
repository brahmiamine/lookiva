import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApi } from '@/openapi';

const FILES = import.meta.glob('../../src/app/api/v1/**/route.ts');

// path -> methods each Next route file must export (and nothing reads env at import time)
const ROUTES: Record<string, string[]> = {
  'auth/register': ['POST'],
  'auth/email/verify': ['POST'],
  'auth/email/resend': ['POST'],
  'auth/login': ['POST'],
  'auth/logout': ['POST'],
  'auth/logout-all': ['POST'],
  'auth/password/forgot': ['POST'],
  'auth/password/reset': ['POST'],
  me: ['GET'],
  'me/sessions': ['GET'],
  'me/sessions/[id]': ['DELETE'],
  'me/preferences': ['GET', 'PATCH'],
  'me/onboarding': ['POST'],
  'geo/cities': ['GET'],
  'me/deactivate': ['POST'],
  'me/deletion-request': ['POST', 'DELETE'],
  'me/export-requests': ['POST', 'GET'],
};

describe('identity route files', () => {
  it('every_route_exports_its_methods_and_is_dynamic', async () => {
    for (const [path, methods] of Object.entries(ROUTES)) {
      const load = FILES[`../../src/app/api/v1/${path}/route.ts`];
      expect(load, path).toBeDefined();
      const mod = (await load?.()) as Record<string, unknown>;
      expect(mod.dynamic, path).toBe('force-dynamic');
      for (const m of methods) expect(typeof mod[m], `${m} ${path}`).toBe('function');
    }
  });

  it('route_files_stay_thin_and_import_only_the_module_index', () => {
    for (const path of Object.keys(ROUTES)) {
      const src = readFileSync(new URL(`../../src/app/api/v1/${path}/route.ts`, import.meta.url), 'utf8');
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(imports, path).toEqual(['@/modules/identity']);
    }
  });

  it('openapi_documents_every_identity_route_with_the_session_cookie_scheme', () => {
    const doc = buildOpenApi();
    expect(doc.components?.securitySchemes?.sessionCookie).toEqual({ type: 'apiKey', in: 'cookie', name: 'lookiva_session' });
    for (const [path, methods] of Object.entries(ROUTES)) {
      const p = doc.paths?.[`/api/v1/${path.replace('[id]', '{id}')}`] as Record<string, { responses: Record<string, unknown>; security?: unknown }>;
      expect(p, path).toBeDefined();
      for (const m of methods) {
        const op = p[m.toLowerCase()];
        expect(op, `${m} ${path}`).toBeDefined();
        const publicCancel = m === 'DELETE' && path === 'me/deletion-request'; // no session left: email + password
        if (publicCancel) continue;
        if (path.startsWith('me') || path.startsWith('geo') || path.startsWith('auth/logout')) {
          expect(op?.security, path).toEqual([{ sessionCookie: [] }]);
          expect(op?.responses['401'], path).toBeDefined();
        }
      }
    }
  });

  it('openapi_documents_503_everywhere_and_idempotency_conflicts_where_a_key_is_used', () => {
    const doc = buildOpenApi();
    for (const [path, methods] of Object.entries(ROUTES)) {
      const p = doc.paths?.[`/api/v1/${path.replace('[id]', '{id}')}`] as Record<string, { responses: Record<string, unknown> }>;
      for (const m of methods) {
        const r = p[m.toLowerCase()]?.responses ?? {};
        expect(JSON.stringify(r['503']), `${m} ${path}`).toContain('EMAIL_TRANSPORT_UNAVAILABLE');
        if (m !== 'GET' && m !== 'DELETE' && !path.startsWith('auth/logout') && path !== 'me/export-requests') {
          expect(JSON.stringify(r['413']), `${m} ${path}`).toContain('PAYLOAD_TOO_LARGE');
        }
      }
    }
    for (const path of ['auth/register', 'auth/password/forgot', 'auth/password/reset']) {
      const r = (doc.paths?.[`/api/v1/${path}`] as Record<string, { responses: Record<string, unknown> }>).post?.responses ?? {};
      expect(JSON.stringify(r['409']), path).toContain('IDEMPOTENCY_IN_PROGRESS');
      expect(JSON.stringify(r['422']), path).toContain('IDEMPOTENCY_KEY_REUSED');
    }
  });
});
