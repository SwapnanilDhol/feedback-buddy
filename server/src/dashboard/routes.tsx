import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { createProjectWithKey, issueKey, redeliverFeedback, testDestination } from '../admin';
import { refreshProjectIcon, refreshProjectIcons } from '../icons';
import { adminAttachmentUrl } from '../attachments';
import {
  clientAddress,
  endSession,
  recordLoginAttempt,
  requireSameOrigin,
  requireSession,
  startSession,
  verifyPassword,
  type AppContext,
} from '../auth';
import { ApiError, isUuid, publicBaseUrl, readLimitedRequestJson } from '../http';
import {
  authenticationOptions,
  challengeCookieName,
  completeAuthentication,
  completeRegistration,
  countPasskeys,
  deletePasskey,
  listPasskeys,
  registrationOptions,
  relyingParty,
  signChallenge,
  toPasskey,
  verifyChallenge,
  type ChallengeKind,
} from '../passkeys';
import {
  createDestination,
  deleteDestination,
  deleteFeedback,
  listApiKeys,
  listAppVersions,
  listDeliveriesWithKinds,
  listDestinations,
  listFeedback,
  listLatestFeedback,
  listProjects,
  overviewStats,
  readDestination,
  readFeedback,
  readProject,
  revokeApiKey,
  toDestination,
  toFeedback,
  updateDestination,
  updateFeedback,
  updateProject,
  type Project,
} from '../repository';
import {
  blankToUndefined,
  categorySchema,
  createDestinationSchema,
  createProjectSchema,
  listFeedbackQuerySchema,
  patchProjectSchema,
  statusSchema,
} from '../schema';
import { base64UrlToUtf8, utf8ToBase64Url } from '../security';
import { Layout, LoginPage, type Flash } from './layout';
import { FeedbackDetailPage, InboxPage, NewAppPage, OverviewPage, SecurityPage, SettingsPage } from './pages';

type Bindings = { Bindings: Env; Variables: { sessionId?: string } };

export const dashboard = new Hono<Bindings>();

const flashCookie = 'fb_flash';

function setFlash(context: AppContext, flash: Flash): void {
  setCookie(context, flashCookie, utf8ToBase64Url(JSON.stringify(flash)), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60,
  });
}

function takeFlash(context: AppContext): Flash | null {
  const raw = getCookie(context, flashCookie);
  if (!raw) return null;
  deleteCookie(context, flashCookie, { path: '/' });
  const decoded = base64UrlToUtf8(raw);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded) as Partial<Flash>;
    if ((parsed.kind === 'info' || parsed.kind === 'error' || parsed.kind === 'key') && typeof parsed.text === 'string') {
      return { kind: parsed.kind, text: parsed.text };
    }
  } catch {
    // Ignore malformed flash cookies.
  }
  return null;
}

async function loadProject(env: Env, id: string): Promise<Project> {
  const project = await readProject(env.DB, id);
  if (!project) throw new ApiError(404, 'project_not_found');
  return project;
}

async function form(context: AppContext): Promise<Record<string, string | string[]>> {
  const body = await context.req.parseBody({ all: true });
  const output: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') output[key] = value;
    else if (Array.isArray(value)) output[key] = value.filter((item): item is string => typeof item === 'string');
  }
  return output;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function many(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// ----- Session -----

async function loginPage(context: AppContext, error: string | null, status: 200 | 401 | 429 = 200) {
  const hasPasskeys = (await countPasskeys(context.env.DB)) > 0;
  const showPassword = !hasPasskeys || context.req.query('password') === '1' || error !== null;
  return context.html(<LoginPage error={error} hasPasskeys={hasPasskeys} showPassword={showPassword} />, status);
}

dashboard.get('/login', (context) => loginPage(context, null));

dashboard.post('/login', async (context) => {
  if (!recordLoginAttempt(clientAddress(context))) {
    return loginPage(context, 'Too many attempts. Try again in a few minutes.', 429);
  }
  const body = await form(context);
  const password = single(body.password) ?? '';
  if (!verifyPassword(password, context.env)) {
    return loginPage(context, 'That password is not right.', 401);
  }
  await startSession(context);
  return context.redirect('/', 303);
});

// ----- Passkey sign-in (public) -----

async function issueChallenge(context: AppContext, challenge: string, kind: ChallengeKind): Promise<void> {
  setCookie(context, challengeCookieName, await signChallenge(context.env.SESSION_SECRET, challenge, kind), {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 300,
  });
}

async function takeChallenge(context: AppContext, kind: ChallengeKind): Promise<string> {
  const challenge = await verifyChallenge(context.env.SESSION_SECRET, getCookie(context, challengeCookieName), kind);
  deleteCookie(context, challengeCookieName, { path: '/' });
  if (!challenge) throw new ApiError(400, 'challenge_missing');
  return challenge;
}

function credentialBody(value: unknown): Record<string, unknown> & { id: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'invalid_credential');
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0 || record.id.length > 1024) throw new ApiError(422, 'invalid_credential');
  return record as Record<string, unknown> & { id: string };
}

dashboard.post('/auth/passkey/options', async (context) => {
  requireSameOrigin(context);
  if (!recordLoginAttempt(clientAddress(context))) throw new ApiError(429, 'rate_limited');
  if ((await countPasskeys(context.env.DB)) === 0) throw new ApiError(404, 'no_passkeys');
  const options = await authenticationOptions(context.env.DB, relyingParty(context.req.raw));
  await issueChallenge(context, options.challenge, 'authentication');
  return context.json(options);
});

dashboard.post('/auth/passkey/verify', async (context) => {
  requireSameOrigin(context);
  if (!recordLoginAttempt(clientAddress(context))) throw new ApiError(429, 'rate_limited');
  const challenge = await takeChallenge(context, 'authentication');
  const credential = credentialBody(await readLimitedRequestJson(context.req.raw, 64 * 1024));
  const passkey = await completeAuthentication(
    context.env.DB,
    relyingParty(context.req.raw),
    challenge,
    credential as unknown as Parameters<typeof completeAuthentication>[3],
  );
  if (!passkey) throw new ApiError(401, 'passkey_rejected');
  await startSession(context);
  return context.json({ ok: true, redirect: '/' });
});

dashboard.post('/logout', async (context) => {
  await endSession(context);
  return context.redirect('/login', 303);
});

dashboard.use('*', requireSession);

// ----- Security (passkeys) -----

dashboard.get('/security', async (context) => {
  const [projects, passkeys] = await Promise.all([listProjects(context.env.DB), listPasskeys(context.env.DB)]);
  return context.html(
    <Layout title="Security" projects={projects} activeNav="security" flash={takeFlash(context)}>
      <SecurityPage passkeys={passkeys.map(toPasskey)} />
    </Layout>,
  );
});

dashboard.post('/security/passkeys/options', async (context) => {
  requireSameOrigin(context);
  const options = await registrationOptions(context.env.DB, relyingParty(context.req.raw));
  await issueChallenge(context, options.challenge, 'registration');
  return context.json(options);
});

dashboard.post('/security/passkeys', async (context) => {
  requireSameOrigin(context);
  const challenge = await takeChallenge(context, 'registration');
  const body = await readLimitedRequestJson(context.req.raw, 64 * 1024);
  const name = (typeof body.name === 'string' ? body.name : '').trim().slice(0, 60) || 'Passkey';
  const credential = credentialBody(body.response);
  const passkey = await completeRegistration(
    context.env.DB,
    relyingParty(context.req.raw),
    challenge,
    name,
    credential as unknown as Parameters<typeof completeRegistration>[4],
  );
  if (!passkey) throw new ApiError(422, 'passkey_rejected');
  setFlash(context, { kind: 'info', text: `Passkey “${passkey.name}” added.` });
  return context.json({ ok: true, passkey }, 201);
});

dashboard.post('/security/passkeys/:id/delete', async (context) => {
  const removed = await deletePasskey(context.env.DB, context.req.param('id'));
  setFlash(context, removed ? { kind: 'info', text: 'Passkey removed.' } : { kind: 'error', text: 'Passkey not found.' });
  return context.redirect('/security', 303);
});

// ----- Overview -----

dashboard.get('/', async (context) => {
  const [projects, stats, latestRows] = await Promise.all([
    listProjects(context.env.DB),
    overviewStats(context.env.DB),
    listLatestFeedback(context.env.DB, 12),
  ]);
  if (projects.some((project) => project.bundle_id && !project.icon_url)) {
    // Fill in missing icons after responding; the next page load shows them.
    context.executionCtx.waitUntil(refreshProjectIcons(context.env));
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  const latest = latestRows
    .map((row) => ({ feedback: toFeedback(row, adminAttachmentUrl), project: byId.get(row.project_id) }))
    .filter((entry): entry is { feedback: ReturnType<typeof toFeedback>; project: Project & { counts: { new: number; triaged: number; closed: number } } } => Boolean(entry.project));
  return context.html(
    <Layout title="Overview" projects={projects} activeNav="overview" flash={takeFlash(context)}>
      <OverviewPage projects={projects} stats={stats} latest={latest} />
    </Layout>,
  );
});

dashboard.get('/apps/new', async (context) => {
  const projects = await listProjects(context.env.DB);
  return context.html(
    <Layout title="New app" projects={projects} activeNav="new" flash={takeFlash(context)}>
      <NewAppPage />
    </Layout>,
  );
});

dashboard.post('/projects', async (context) => {
  const body = await form(context);
  const retention = blankToUndefined(single(body.retention_days));
  const parsed = createProjectSchema.safeParse({
    name: single(body.name) ?? '',
    bundle_id: blankToUndefined(single(body.bundle_id)) ?? null,
    retention_days: retention ? Number(retention) : 30,
  });
  if (!parsed.success) {
    setFlash(context, { kind: 'error', text: 'Check the project name and retention days.' });
    return context.redirect('/apps/new', 303);
  }
  const { project, public_key } = await createProjectWithKey(context.env, parsed.data);
  context.executionCtx.waitUntil(refreshProjectIcon(context.env, project));
  setFlash(context, { kind: 'key', text: public_key });
  return context.redirect(`/p/${project.id}/settings`, 303);
});

// ----- Inbox -----

dashboard.get('/p/:id', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const raw = context.req.query();
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const parsedQuery = listFeedbackQuerySchema.safeParse(cleaned);
  const query = parsedQuery.success ? parsedQuery.data : listFeedbackQuerySchema.parse({});
  const [projects, result, appVersions] = await Promise.all([
    listProjects(context.env.DB),
    listFeedback(context.env.DB, project.id, query),
    listAppVersions(context.env.DB, project.id),
  ]);
  return context.html(
    <Layout title={project.name} projects={projects} activeProjectId={project.id} flash={takeFlash(context)}>
      <InboxPage
        project={project}
        feedback={result.rows.map((row) => toFeedback(row, adminAttachmentUrl))}
        query={query}
        nextCursor={result.next_cursor}
        appVersions={appVersions}
      />
    </Layout>,
  );
});

dashboard.get('/p/:id/f/:fid', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const feedbackId = context.req.param('fid');
  if (!isUuid(feedbackId)) throw new ApiError(404, 'feedback_not_found');
  const row = await readFeedback(context.env.DB, feedbackId);
  if (!row || row.project_id !== project.id) throw new ApiError(404, 'feedback_not_found');
  const [projects, deliveries] = await Promise.all([listProjects(context.env.DB), listDeliveriesWithKinds(context.env.DB, row.id)]);
  return context.html(
    <Layout title={`${project.name} · ${row.id.slice(0, 8).toUpperCase()}`} projects={projects} activeProjectId={project.id} flash={takeFlash(context)}>
      <FeedbackDetailPage project={project} feedback={toFeedback(row, adminAttachmentUrl)} deliveries={deliveries} />
    </Layout>,
  );
});

async function loadOwnedFeedback(context: AppContext): Promise<{ project: Project; feedbackId: string }> {
  const project = await loadProject(context.env, context.req.param('id') ?? '');
  const feedbackId = context.req.param('fid') ?? '';
  if (!isUuid(feedbackId)) throw new ApiError(404, 'feedback_not_found');
  const row = await readFeedback(context.env.DB, feedbackId);
  if (!row || row.project_id !== project.id) throw new ApiError(404, 'feedback_not_found');
  return { project, feedbackId: row.id };
}

dashboard.post('/p/:id/f/:fid/status', async (context) => {
  const { project, feedbackId } = await loadOwnedFeedback(context);
  const status = statusSchema.safeParse(single((await form(context)).status));
  if (status.success) await updateFeedback(context.env.DB, feedbackId, { status: status.data });
  return context.redirect(`/p/${project.id}/f/${feedbackId}`, 303);
});

dashboard.post('/p/:id/f/:fid/note', async (context) => {
  const { project, feedbackId } = await loadOwnedFeedback(context);
  const note = (single((await form(context)).internal_note) ?? '').slice(0, 4000);
  await updateFeedback(context.env.DB, feedbackId, { internal_note: note.trim() ? note : null });
  setFlash(context, { kind: 'info', text: 'Note saved.' });
  return context.redirect(`/p/${project.id}/f/${feedbackId}`, 303);
});

dashboard.post('/p/:id/f/:fid/delete', async (context) => {
  const { project, feedbackId } = await loadOwnedFeedback(context);
  const removed = await deleteFeedback(context.env.DB, feedbackId);
  if (removed?.attachment_key) await context.env.ATTACHMENTS.delete(removed.attachment_key);
  setFlash(context, { kind: 'info', text: 'Feedback deleted.' });
  return context.redirect(`/p/${project.id}`, 303);
});

dashboard.post('/p/:id/f/:fid/redeliver', async (context) => {
  const { project, feedbackId } = await loadOwnedFeedback(context);
  const requeued = await redeliverFeedback(context.env, publicBaseUrl(context.env, context.req.raw), feedbackId);
  setFlash(context, { kind: 'info', text: requeued ? `Retried ${requeued} deliver${requeued === 1 ? 'y' : 'ies'}.` : 'Nothing to retry.' });
  return context.redirect(`/p/${project.id}/f/${feedbackId}`, 303);
});

// ----- Settings -----

dashboard.get('/p/:id/settings', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const flash = takeFlash(context);
  const [projects, keys, destinations] = await Promise.all([
    listProjects(context.env.DB),
    listApiKeys(context.env.DB, project.id),
    listDestinations(context.env.DB, project.id),
  ]);
  return context.html(
    <Layout title={`${project.name} · Settings`} projects={projects} activeProjectId={project.id} flash={flash}>
      <SettingsPage
        project={project}
        keys={keys}
        destinations={destinations.map(toDestination)}
        baseUrl={publicBaseUrl(context.env, context.req.raw)}
        newKey={flash?.kind === 'key' ? flash.text : null}
      />
    </Layout>,
  );
});

dashboard.post('/p/:id/settings', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const body = await form(context);
  const retention = blankToUndefined(single(body.retention_days));
  const parsed = patchProjectSchema.safeParse({
    name: single(body.name) ?? project.name,
    bundle_id: blankToUndefined(single(body.bundle_id)) ?? null,
    ...(retention ? { retention_days: Number(retention) } : {}),
  });
  if (!parsed.success) {
    setFlash(context, { kind: 'error', text: 'Check the name and retention days.' });
  } else {
    const updated = await updateProject(context.env.DB, project.id, parsed.data);
    if (updated && updated.bundle_id && updated.bundle_id !== project.bundle_id) {
      context.executionCtx.waitUntil(refreshProjectIcon(context.env, { ...updated, icon_url: null }));
    }
    setFlash(context, { kind: 'info', text: 'Project saved.' });
  }
  return context.redirect(`/p/${project.id}/settings`, 303);
});

dashboard.post('/p/:id/keys', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const { public_key } = await issueKey(context.env, project.id);
  setFlash(context, { kind: 'key', text: public_key });
  return context.redirect(`/p/${project.id}/settings`, 303);
});

dashboard.post('/p/:id/keys/:keyId/revoke', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const revoked = await revokeApiKey(context.env.DB, project.id, context.req.param('keyId'));
  setFlash(context, revoked ? { kind: 'info', text: 'Key revoked.' } : { kind: 'error', text: 'Key not found.' });
  return context.redirect(`/p/${project.id}/settings`, 303);
});

dashboard.post('/p/:id/destinations', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const body = await form(context);
  const parsed = createDestinationSchema.safeParse({
    kind: single(body.kind),
    url: single(body.url) ?? '',
    secret: blankToUndefined(single(body.secret)) ?? null,
    categories: many(body.categories).filter((value) => categorySchema.safeParse(value).success),
  });
  if (!parsed.success) {
    setFlash(context, { kind: 'error', text: 'Slack and webhooks need an https URL (webhooks also a secret of 8+ characters); email needs a valid address.' });
  } else {
    await createDestination(context.env.DB, {
      project_id: project.id,
      kind: parsed.data.kind,
      url: parsed.data.url,
      secret: parsed.data.secret ?? null,
      categories: parsed.data.categories,
    });
    setFlash(context, { kind: 'info', text: 'Destination added.' });
  }
  return context.redirect(`/p/${project.id}/settings`, 303);
});

dashboard.post('/p/:id/destinations/:destId/toggle', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const destination = await readDestination(context.env.DB, project.id, context.req.param('destId'));
  if (destination) await updateDestination(context.env.DB, project.id, destination.id, { enabled: destination.enabled !== 1 });
  return context.redirect(`/p/${project.id}/settings`, 303);
});

dashboard.post('/p/:id/destinations/:destId/delete', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  await deleteDestination(context.env.DB, project.id, context.req.param('destId'));
  setFlash(context, { kind: 'info', text: 'Destination removed.' });
  return context.redirect(`/p/${project.id}/settings`, 303);
});

dashboard.post('/p/:id/destinations/:destId/test', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const result = await testDestination(context.env, project, context.req.param('destId'));
  setFlash(context, result.ok ? { kind: 'info', text: 'Test delivery succeeded.' } : { kind: 'error', text: `Test delivery failed: ${result.error ?? 'unknown'}.` });
  return context.redirect(`/p/${project.id}/settings`, 303);
});
