import { z } from 'zod';
import { problemSchema } from '@/platform/http/errors';
import { registry, registerRoute } from '@/platform/openapi/registry';
import { SESSION_COOKIE } from './cookie';
import * as s from './schemas';

registry.registerComponent('securitySchemes', 'sessionCookie', { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE });

const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: problemSchema } } });
const json = (description: string, schema: z.ZodType) => ({ description, content: { 'application/json': { schema } } });
const body = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const csrf = z.object({ 'X-Requested-With': z.literal('lookiva') });
const idempotency = csrf.extend({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });
const session = [{ sessionCookie: [] }];
const tags = ['identity'];

const common = {
  400: problem('VALIDATION_ERROR or INVALID_JSON'),
  403: problem('CSRF_REJECTED (missing X-Requested-With: lookiva or foreign Origin)'),
  429: problem('RATE_LIMITED (Retry-After header)'),
};
const authed = {
  401: problem('UNAUTHENTICATED (no, unknown, revoked or expired session)'),
  403: problem('CSRF_REJECTED on unsafe methods'),
};

registerRoute({
  method: 'post', path: '/api/v1/auth/register', tags,
  summary: 'Create an account (same answer whether or not the email exists); mails a verification link',
  request: { headers: idempotency, body: body(s.registerBody) },
  responses: { 202: json('Accepted', s.acceptedResponse), ...common, 503: problem('EMAIL_TRANSPORT_UNAVAILABLE') },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/email/verify', tags,
  summary: 'Consume a one-time email verification token',
  request: { headers: csrf, body: body(s.tokenBody) },
  responses: { 200: json('Email verified', s.verifiedResponse), ...common, 400: problem('INVALID_TOKEN (unknown, used or expired) or VALIDATION_ERROR') },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/email/resend', tags,
  summary: 'Resend the verification link (60 s cooldown; same answer for unknown emails)',
  request: { headers: csrf, body: body(s.emailBody) },
  responses: { 202: json('Accepted', s.acceptedResponse), ...common },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/login', tags,
  summary: 'Open a session (sets the lookiva_session cookie)',
  request: { headers: csrf, body: body(s.loginBody) },
  responses: {
    200: { ...json('Signed in; Set-Cookie: lookiva_session (HttpOnly, SameSite=Lax, Secure in production)', s.loginResponse) },
    ...common,
    401: problem('INVALID_CREDENTIALS (unknown email, wrong password or inactive account)'),
    403: problem('EMAIL_NOT_VERIFIED (only after a correct password) or CSRF_REJECTED'),
  },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/logout', tags, security: session,
  summary: 'Revoke the current session',
  request: { headers: csrf },
  responses: { 204: { description: 'Signed out; cookie cleared' }, ...authed },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/logout-all', tags, security: session,
  summary: 'Revoke every session of the user',
  request: { headers: csrf },
  responses: { 204: { description: 'All sessions revoked; cookie cleared' }, ...authed },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/password/forgot', tags,
  summary: 'Mail a password reset link (same answer for unknown emails)',
  request: { headers: idempotency, body: body(s.emailBody) },
  responses: { 202: json('Accepted', s.acceptedResponse), ...common },
});
registerRoute({
  method: 'post', path: '/api/v1/auth/password/reset', tags,
  summary: 'Set a new password with a reset token; revokes every session',
  request: { headers: idempotency, body: body(s.resetBody) },
  responses: { 200: json('Password changed', s.passwordResetResponse), ...common, 400: problem('INVALID_TOKEN or VALIDATION_ERROR') },
});
registerRoute({
  method: 'get', path: '/api/v1/me', tags, security: session,
  summary: 'Current account',
  responses: { 200: json('Account', s.meResponse), ...authed },
});
registerRoute({
  method: 'get', path: '/api/v1/me/sessions', tags, security: session,
  summary: 'Active sessions of the user (cursor pagination)',
  request: { query: z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() }) },
  responses: { 200: json('Sessions, newest first', s.sessionsResponse), 400: problem('VALIDATION_ERROR or INVALID_CURSOR'), ...authed },
});
registerRoute({
  method: 'delete', path: '/api/v1/me/sessions/{id}', tags, security: session,
  summary: 'Revoke one of the user\'s sessions',
  request: { headers: csrf, params: z.object({ id: z.uuid() }) },
  responses: { 204: { description: 'Revoked' }, ...authed, 404: problem('NOT_FOUND (unknown, revoked or another user\'s session)') },
});
registerRoute({
  method: 'get', path: '/api/v1/me/preferences', tags, security: session,
  summary: 'Preferences (ETag W/"v<version>")',
  responses: { 200: json('Preferences', s.preferencesResponse), ...authed },
});
registerRoute({
  method: 'patch', path: '/api/v1/me/preferences', tags, security: session,
  summary: 'Partial update guarded by If-Match',
  request: { headers: csrf.extend({ 'If-Match': z.string() }), body: body(s.preferencesPatchBody) },
  responses: {
    200: json('Updated preferences (new ETag)', s.preferencesResponse),
    400: problem('VALIDATION_ERROR'),
    ...authed,
    409: problem('VERSION_CONFLICT (stale ETag; `*` is refused too)'),
    428: problem('IF_MATCH_REQUIRED'),
  },
});
registerRoute({
  method: 'post', path: '/api/v1/me/onboarding', tags, security: session,
  summary: 'Onboarding: locale and city required; GPS and timezone optional (IANA, default UTC)',
  request: { headers: csrf, body: body(s.onboardingBody) },
  responses: { 200: json('Preferences after onboarding', s.preferencesResponse), 400: problem('VALIDATION_ERROR'), ...authed, 409: problem('VERSION_CONFLICT') },
});
