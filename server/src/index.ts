import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { admin } from './admin';
import { serveAttachmentByToken } from './attachments';
import { dashboard } from './dashboard/routes';
import { handleIngest } from './ingest';
import { errorMessage, writeLog } from './log';
import { markMaintenanceRun, runMaintenance, shouldRunMaintenance } from './maintenance';

const app = new Hono<{ Bindings: Env; Variables: { sessionId?: string } }>();

app.use('*', async (context, next) => {
  await next();
  if (context.req.path === '/health') return;
  const now = Date.now();
  if (!shouldRunMaintenance(now)) return;
  markMaintenanceRun(now);
  context.executionCtx.waitUntil(runMaintenance(context.env));
});

app.get('/health', (context) =>
  context.json({ ok: true, service: 'feedback-buddy', version: context.env.VERSION ?? 'dev' }),
);

app.post('/v1/feedback', handleIngest);
app.get('/v1/attachments/:token', (context) => serveAttachmentByToken(context.env, context.req.param('token')));

app.route('/api/v1', admin);
app.route('/', dashboard);

app.notFound((context) => {
  if (context.req.path.startsWith('/api/') || context.req.path.startsWith('/v1/')) {
    return context.json({ error: 'not_found' }, 404);
  }
  return context.text('Not found', 404);
});

app.onError((error, context) => {
  const status = error instanceof HTTPException ? error.status : 500;
  writeLog('request.failed', status >= 500 ? 'error' : 'warn', {
    method: context.req.method,
    path: context.req.path,
    status,
    error: errorMessage(error),
  });
  return context.json({ error: status >= 500 ? 'internal_error' : errorMessage(error) }, status);
});

export { app };

export default {
  fetch: app.fetch,
  // Kept so a cron trigger can be added back on a plan with spare cron slots;
  // without one, maintenance runs from requests (see the middleware above).
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
