import { createLogger, type Logger } from '../logger';
import { getEnv } from '../env';
import { toAppError, toProblem } from './errors';
import { newId } from './ids';

type Ctx = { requestId: string; log: Logger };
type Handler = (req: Request, ctx: Ctx) => Promise<Response>;

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

let defaultLogger: Logger | undefined;
// A bad env must not take withApi down (startup validation lives in instrumentation.ts): fall back to the default level.
const lazyLogger = (): Logger => {
  if (defaultLogger) return defaultLogger;
  try {
    return (defaultLogger = createLogger({ level: getEnv().LOG_LEVEL }));
  } catch {
    return createLogger();
  }
};

export function withApi(handler: Handler, deps: { logger?: Logger } = {}): (req: Request) => Promise<Response> {
  return async (req) => {
    const inbound = req.headers.get('x-request-id');
    const requestId = inbound !== null && REQUEST_ID_RE.test(inbound) ? inbound : newId();
    const log = (deps.logger ?? lazyLogger()).child({ requestId });
    try {
      // Re-wrap: headers of a Response from fetch()/redirect() are immutable.
      const inner = await handler(req, { requestId, log });
      const res = new Response(inner.body, inner);
      res.headers.set('X-Request-Id', requestId);
      return res;
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.status >= 500) log.error({ err }, 'unhandled error');
      return Response.json(toProblem(appErr, requestId), {
        status: appErr.status,
        headers: { 'Content-Type': 'application/problem+json', 'X-Request-Id': requestId },
      });
    }
  };
}
