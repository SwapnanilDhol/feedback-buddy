import { nowIso } from './http';
import { base64UrlDecode, base64UrlEncode, randomUrlSafe } from './security';
import type { AccountStatus, Category, DestinationKind, ListFeedbackQuery, Status, Submission } from './schema';

// ---------- Projects ----------

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  bundle_id: string | null;
  accent: string | null;
  retention_days: number;
  icon_url: string | null;
  icon_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  bundle_id: string | null;
  accent: string | null;
  retention_days: number;
  icon_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCounts {
  new: number;
  triaged: number;
  closed: number;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bundle_id: row.bundle_id,
    accent: row.accent,
    retention_days: row.retention_days,
    icon_url: row.icon_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : `app-${randomUrlSafe(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
}

export async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 36)}-${attempt + 1}`;
    const existing = await db.prepare('SELECT 1 FROM projects WHERE slug = ?1').bind(candidate).first();
    if (!existing) return candidate;
  }
  throw new Error('slug_unavailable');
}

export async function createProject(
  db: D1Database,
  input: { name: string; slug: string; bundle_id?: string | null; retention_days: number; accent?: string | null },
): Promise<Project> {
  const now = nowIso();
  const id = `prj_${randomUrlSafe(16)}`;
  await db
    .prepare(
      `INSERT INTO projects (id, slug, name, bundle_id, accent, retention_days, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
    )
    .bind(id, input.slug, input.name, input.bundle_id ?? null, input.accent ?? null, input.retention_days, now)
    .run();
  const row = await readProject(db, id);
  if (!row) throw new Error('project_missing_after_insert');
  return row;
}

export async function readProject(db: D1Database, id: string): Promise<Project | null> {
  const row = await db.prepare('SELECT * FROM projects WHERE id = ?1').bind(id).first<ProjectRow>();
  return row ? toProject(row) : null;
}

export async function listProjects(db: D1Database): Promise<Array<Project & { counts: ProjectCounts }>> {
  const { results } = await db
    .prepare(
      `SELECT p.*,
         (SELECT COUNT(*) FROM feedback f WHERE f.project_id = p.id AND f.status = 'new') AS count_new,
         (SELECT COUNT(*) FROM feedback f WHERE f.project_id = p.id AND f.status = 'triaged') AS count_triaged,
         (SELECT COUNT(*) FROM feedback f WHERE f.project_id = p.id AND f.status = 'closed') AS count_closed
       FROM projects p ORDER BY p.created_at ASC`,
    )
    .all<ProjectRow & { count_new: number; count_triaged: number; count_closed: number }>();
  return results.map((row) => ({
    ...toProject(row),
    counts: { new: row.count_new, triaged: row.count_triaged, closed: row.count_closed },
  }));
}

export async function updateProject(
  db: D1Database,
  id: string,
  patch: { name?: string; bundle_id?: string | null; retention_days?: number; accent?: string | null; icon_url?: string | null },
): Promise<Project | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?${values.length + 1}`);
    values.push(value);
  };
  if (patch.name !== undefined) push('name', patch.name);
  if (patch.bundle_id !== undefined) push('bundle_id', patch.bundle_id);
  if (patch.retention_days !== undefined) push('retention_days', patch.retention_days);
  if (patch.accent !== undefined) push('accent', patch.accent);
  if (patch.icon_url !== undefined) {
    push('icon_url', patch.icon_url);
    push('icon_checked_at', nowIso()); // a manual icon counts as checked
  }
  if (sets.length === 0) return readProject(db, id);
  push('updated_at', nowIso());
  values.push(id);
  await db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?${values.length}`).bind(...values).run();
  return readProject(db, id);
}

/** Projects whose icon should be (re)checked: never checked, or checked more than a week ago. */
export async function listProjectsNeedingIcon(db: D1Database, now = Date.now(), limit = 3): Promise<Project[]> {
  const stale = new Date(now - iconRecheckMs).toISOString();
  const { results } = await db
    .prepare(
      `SELECT * FROM projects
       WHERE bundle_id IS NOT NULL AND (icon_checked_at IS NULL OR icon_checked_at < ?1)
       ORDER BY icon_checked_at ASC NULLS FIRST LIMIT ${limit}`,
    )
    .bind(stale)
    .all<ProjectRow>();
  return results.map(toProject);
}

export const iconRecheckMs = 7 * 24 * 60 * 60 * 1000;
export const iconRetryMs = 15 * 60 * 1000;

export async function updateProjectIcon(db: D1Database, id: string, iconUrl: string | null, now = Date.now()): Promise<void> {
  await db
    .prepare('UPDATE projects SET icon_url = COALESCE(?2, icon_url), icon_checked_at = ?3 WHERE id = ?1')
    .bind(id, iconUrl, new Date(now).toISOString())
    .run();
}

/**
 * A failed lookup (network error, rate limit) should be retried soon, not in a
 * week. The check timestamp is backdated so the project becomes due again
 * after `iconRetryMs` without needing another column.
 */
export async function markIconLookupFailed(db: D1Database, id: string, now = Date.now(), retryMs = iconRetryMs): Promise<void> {
  const dueAgainAt = now - iconRecheckMs + retryMs;
  await db.prepare('UPDATE projects SET icon_checked_at = ?2 WHERE id = ?1').bind(id, new Date(dueAgainAt).toISOString()).run();
}

export interface OverviewStats {
  new: number;
  open_bugs: number;
  last_7_days: number;
  awaiting_reply: number;
}

export async function overviewStats(db: D1Database, now = Date.now()): Promise<OverviewStats> {
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS n_new,
         SUM(CASE WHEN category = 'bug' AND status != 'closed' THEN 1 ELSE 0 END) AS n_bugs,
         SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS n_week,
         SUM(CASE WHEN status = 'new' AND reply_email IS NOT NULL THEN 1 ELSE 0 END) AS n_reply
       FROM feedback`,
    )
    .bind(weekAgo)
    .first<{ n_new: number | null; n_bugs: number | null; n_week: number | null; n_reply: number | null }>();
  return {
    new: row?.n_new ?? 0,
    open_bugs: row?.n_bugs ?? 0,
    last_7_days: row?.n_week ?? 0,
    awaiting_reply: row?.n_reply ?? 0,
  };
}

/** Newest feedback across every project, for the overview stream. */
export async function listLatestFeedback(db: D1Database, limit = 12): Promise<FeedbackRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM feedback ORDER BY created_at DESC, id DESC LIMIT ${Math.min(Math.max(limit, 1), 50)}`)
    .all<FeedbackRow>();
  return results;
}

// ---------- API keys ----------

export interface ApiKeyRow {
  id: string;
  project_id: string;
  kind: 'public' | 'admin';
  prefix: string;
  hash: string;
  created_at: string;
  revoked_at: string | null;
}

export interface ApiKey {
  id: string;
  project_id: string;
  kind: 'public' | 'admin';
  prefix: string;
  created_at: string;
  revoked_at: string | null;
}

export function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    prefix: row.prefix,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

export async function insertApiKey(
  db: D1Database,
  input: { project_id: string; prefix: string; hash: string },
): Promise<ApiKey> {
  const id = `key_${randomUrlSafe(16)}`;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO api_keys (id, project_id, kind, prefix, hash, created_at)
       VALUES (?1, ?2, 'public', ?3, ?4, ?5)`,
    )
    .bind(id, input.project_id, input.prefix, input.hash, now)
    .run();
  return { id, project_id: input.project_id, kind: 'public', prefix: input.prefix, created_at: now, revoked_at: null };
}

export async function listApiKeys(db: D1Database, projectId: string): Promise<ApiKey[]> {
  const { results } = await db
    .prepare('SELECT * FROM api_keys WHERE project_id = ?1 ORDER BY created_at DESC')
    .bind(projectId)
    .all<ApiKeyRow>();
  return results.map(toApiKey);
}

export async function revokeApiKey(db: D1Database, projectId: string, keyId: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE api_keys SET revoked_at = ?3 WHERE id = ?1 AND project_id = ?2 AND revoked_at IS NULL')
    .bind(keyId, projectId, nowIso())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function resolveProjectByKeyHash(db: D1Database, hash: string): Promise<Project | null> {
  const row = await db
    .prepare(
      `SELECT p.* FROM api_keys k JOIN projects p ON p.id = k.project_id
       WHERE k.hash = ?1 AND k.kind = 'public' AND k.revoked_at IS NULL`,
    )
    .bind(hash)
    .first<ProjectRow>();
  return row ? toProject(row) : null;
}

// ---------- Feedback ----------

export interface FeedbackRow {
  id: string;
  project_id: string;
  idempotency_key: string;
  category: Category;
  message: string;
  name: string | null;
  reply_email: string | null;
  installation_hash: string;
  user_agent: string | null;
  app_version: string;
  build_number: string;
  os_version: string;
  locale: string;
  device_family: string;
  device_model: string | null;
  user_id: string | null;
  account_status: AccountStatus;
  plan: string | null;
  entitlements_json: string;
  attributes_json: string;
  attachment_key: string | null;
  attachment_content_type: 'image/jpeg' | 'image/png' | null;
  attachment_byte_count: number | null;
  attachment_token: string | null;
  status: Status;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackAttachment {
  content_type: 'image/jpeg' | 'image/png';
  byte_count: number;
  url: string;
}

export interface Feedback {
  id: string;
  project_id: string;
  category: Category;
  status: Status;
  message: string;
  name: string | null;
  reply_email: string | null;
  context: {
    app_version: string;
    build_number: string;
    os_version: string;
    locale: string;
    device_family: string;
    device_model: string | null;
  };
  user: {
    id: string | null;
    account_status: AccountStatus;
    plan: string | null;
    entitlements: string[];
    attributes: Record<string, string>;
  };
  attachment: FeedbackAttachment | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

export type AttachmentUrlResolver = (row: FeedbackRow) => string;

export function toFeedback(row: FeedbackRow, attachmentUrl: AttachmentUrlResolver): Feedback {
  const hasAttachment = row.attachment_key && row.attachment_content_type && row.attachment_byte_count !== null;
  return {
    id: row.id,
    project_id: row.project_id,
    category: row.category,
    status: row.status,
    message: row.message,
    name: row.name,
    reply_email: row.reply_email,
    context: {
      app_version: row.app_version,
      build_number: row.build_number,
      os_version: row.os_version,
      locale: row.locale,
      device_family: row.device_family,
      device_model: row.device_model,
    },
    user: {
      id: row.user_id,
      account_status: row.account_status,
      plan: row.plan,
      entitlements: parseJsonArray(row.entitlements_json),
      attributes: parseJsonRecord(row.attributes_json),
    },
    attachment: hasAttachment
      ? {
          content_type: row.attachment_content_type as 'image/jpeg' | 'image/png',
          byte_count: row.attachment_byte_count as number,
          url: attachmentUrl(row),
        }
      : null,
    internal_note: row.internal_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export interface NewFeedback {
  id: string;
  project_id: string;
  idempotency_key: string;
  submission: Submission;
  installation_hash: string;
  user_agent: string | null;
  attachment: { key: string; content_type: 'image/jpeg' | 'image/png'; byte_count: number; token: string } | null;
}

export async function insertFeedback(
  db: D1Database,
  input: NewFeedback,
): Promise<{ row: FeedbackRow; inserted: boolean }> {
  const now = nowIso();
  const { submission } = input;
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO feedback (
         id, project_id, idempotency_key, category, message, name, reply_email,
         installation_hash, user_agent, app_version, build_number, os_version, locale,
         device_family, device_model, user_id, account_status, plan, entitlements_json,
         attributes_json, attachment_key, attachment_content_type, attachment_byte_count,
         attachment_token, created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
         ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?25
       )`,
    )
    .bind(
      input.id,
      input.project_id,
      input.idempotency_key,
      submission.category,
      submission.message,
      submission.name ?? null,
      submission.reply_email ?? null,
      input.installation_hash,
      input.user_agent,
      submission.context.app_version,
      submission.context.build_number,
      submission.context.os_version,
      submission.context.locale,
      submission.context.device_family,
      submission.context.device_model ?? null,
      submission.user.id ?? null,
      submission.user.account_status,
      submission.user.plan ?? null,
      JSON.stringify(submission.user.entitlements),
      JSON.stringify(submission.user.attributes),
      input.attachment?.key ?? null,
      input.attachment?.content_type ?? null,
      input.attachment?.byte_count ?? null,
      input.attachment?.token ?? null,
      now,
    )
    .run();
  const row = await db
    .prepare('SELECT * FROM feedback WHERE project_id = ?1 AND idempotency_key = ?2')
    .bind(input.project_id, input.idempotency_key)
    .first<FeedbackRow>();
  if (!row) throw new Error('feedback_missing_after_insert');
  return { row, inserted: (result.meta.changes ?? 0) > 0 };
}

/** Removes a feedback row (deliveries cascade) and returns it so the caller can delete the R2 object. */
export async function deleteFeedback(db: D1Database, id: string): Promise<FeedbackRow | null> {
  const row = await db.prepare('SELECT * FROM feedback WHERE id = ?1').bind(id).first<FeedbackRow>();
  if (!row) return null;
  await db.prepare('DELETE FROM deliveries WHERE feedback_id = ?1').bind(id).run();
  await db.prepare('DELETE FROM feedback WHERE id = ?1').bind(id).run();
  return row;
}

export async function readFeedback(db: D1Database, id: string): Promise<FeedbackRow | null> {
  return db.prepare('SELECT * FROM feedback WHERE id = ?1').bind(id).first<FeedbackRow>();
}

export async function readFeedbackByAttachmentToken(db: D1Database, token: string): Promise<FeedbackRow | null> {
  return db
    .prepare('SELECT * FROM feedback WHERE attachment_token = ?1 AND attachment_key IS NOT NULL')
    .bind(token)
    .first<FeedbackRow>();
}

export async function countRecentByInstallation(db: D1Database, installationHash: string, sinceIso: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM feedback WHERE installation_hash = ?1 AND created_at > ?2')
    .bind(installationHash, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function countRecentByProject(db: D1Database, projectId: string, sinceIso: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM feedback WHERE project_id = ?1 AND created_at > ?2')
    .bind(projectId, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export function encodeCursor(row: FeedbackRow): string {
  return base64UrlEncode(`${row.created_at}|${row.id}`);
}

export function decodeCursor(cursor: string | undefined): { created_at: string; id: string } | null {
  if (!cursor) return null;
  const decoded = base64UrlDecode(cursor);
  if (!decoded) return null;
  const separator = decoded.indexOf('|');
  if (separator <= 0) return null;
  return { created_at: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
}

export async function listFeedback(
  db: D1Database,
  projectId: string,
  query: ListFeedbackQuery,
): Promise<{ rows: FeedbackRow[]; next_cursor: string | null }> {
  const clauses = ['project_id = ?1'];
  const values: unknown[] = [projectId];
  const bind = (value: unknown): string => {
    values.push(value);
    return `?${values.length}`;
  };
  if (query.status) clauses.push(`status = ${bind(query.status)}`);
  if (query.category) clauses.push(`category = ${bind(query.category)}`);
  if (query.app_version) clauses.push(`app_version = ${bind(query.app_version)}`);
  if (query.q) {
    const like = `%${query.q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
    clauses.push(
      `(message LIKE ${bind(like)} ESCAPE '\\' OR name LIKE ${bind(like)} ESCAPE '\\' OR reply_email LIKE ${bind(like)} ESCAPE '\\')`,
    );
  }
  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    clauses.push(`(created_at < ${bind(cursor.created_at)} OR (created_at = ${bind(cursor.created_at)} AND id < ${bind(cursor.id)}))`);
  }
  const limit = query.limit + 1;
  const { results } = await db
    .prepare(`SELECT * FROM feedback WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ${limit}`)
    .bind(...values)
    .all<FeedbackRow>();
  const hasMore = results.length > query.limit;
  const rows = hasMore ? results.slice(0, query.limit) : results;
  const last = rows[rows.length - 1];
  return { rows, next_cursor: hasMore && last ? encodeCursor(last) : null };
}

export async function listAppVersions(db: D1Database, projectId: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT DISTINCT app_version FROM feedback WHERE project_id = ?1 ORDER BY app_version DESC LIMIT 50')
    .bind(projectId)
    .all<{ app_version: string }>();
  return results.map((row) => row.app_version);
}

export async function updateFeedback(
  db: D1Database,
  id: string,
  patch: { status?: Status; internal_note?: string | null },
): Promise<FeedbackRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) {
    values.push(patch.status);
    sets.push(`status = ?${values.length}`);
  }
  if (patch.internal_note !== undefined) {
    values.push(patch.internal_note);
    sets.push(`internal_note = ?${values.length}`);
  }
  if (sets.length === 0) return readFeedback(db, id);
  values.push(nowIso());
  sets.push(`updated_at = ?${values.length}`);
  values.push(id);
  await db.prepare(`UPDATE feedback SET ${sets.join(', ')} WHERE id = ?${values.length}`).bind(...values).run();
  return readFeedback(db, id);
}

export async function clearAttachment(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE feedback SET attachment_key = NULL, attachment_content_type = NULL,
         attachment_byte_count = NULL, attachment_token = NULL, updated_at = ?2
       WHERE id = ?1`,
    )
    .bind(id, nowIso())
    .run();
}

export async function listExpiredAttachments(
  db: D1Database,
  limit = 100,
): Promise<Array<{ id: string; attachment_key: string }>> {
  // SQLite datetime arithmetic on ISO-8601 strings; retention is per project.
  const { results } = await db
    .prepare(
      `SELECT f.id, f.attachment_key FROM feedback f JOIN projects p ON p.id = f.project_id
       WHERE f.attachment_key IS NOT NULL
         AND f.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || p.retention_days || ' days')
       LIMIT ${limit}`,
    )
    .all<{ id: string; attachment_key: string }>();
  return results;
}

// ---------- Destinations ----------

export interface DestinationRow {
  id: string;
  project_id: string;
  kind: DestinationKind;
  url: string;
  secret: string | null;
  categories_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface Destination {
  id: string;
  project_id: string;
  kind: DestinationKind;
  url: string;
  has_secret: boolean;
  categories: Category[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function toDestination(row: DestinationRow): Destination {
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    url: row.url,
    has_secret: Boolean(row.secret),
    categories: parseJsonArray(row.categories_json) as Category[],
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createDestination(
  db: D1Database,
  input: { project_id: string; kind: DestinationKind; url: string; secret: string | null; categories: Category[] },
): Promise<DestinationRow> {
  const id = `dst_${randomUrlSafe(16)}`;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO destinations (id, project_id, kind, url, secret, categories_json, enabled, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)`,
    )
    .bind(id, input.project_id, input.kind, input.url, input.secret, JSON.stringify(input.categories), now)
    .run();
  const row = await readDestination(db, input.project_id, id);
  if (!row) throw new Error('destination_missing_after_insert');
  return row;
}

export async function readDestination(db: D1Database, projectId: string, id: string): Promise<DestinationRow | null> {
  return db
    .prepare('SELECT * FROM destinations WHERE id = ?1 AND project_id = ?2')
    .bind(id, projectId)
    .first<DestinationRow>();
}

export async function readDestinationById(db: D1Database, id: string): Promise<DestinationRow | null> {
  return db.prepare('SELECT * FROM destinations WHERE id = ?1').bind(id).first<DestinationRow>();
}

export async function listDestinations(db: D1Database, projectId: string): Promise<DestinationRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM destinations WHERE project_id = ?1 ORDER BY created_at ASC')
    .bind(projectId)
    .all<DestinationRow>();
  return results;
}

export async function updateDestination(
  db: D1Database,
  projectId: string,
  id: string,
  patch: { enabled?: boolean; url?: string; secret?: string | null; categories?: Category[] },
): Promise<DestinationRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = ?${values.length}`);
  };
  if (patch.enabled !== undefined) push('enabled', patch.enabled ? 1 : 0);
  if (patch.url !== undefined) push('url', patch.url);
  if (patch.secret !== undefined) push('secret', patch.secret);
  if (patch.categories !== undefined) push('categories_json', JSON.stringify(patch.categories));
  if (sets.length === 0) return readDestination(db, projectId, id);
  push('updated_at', nowIso());
  values.push(id, projectId);
  await db
    .prepare(`UPDATE destinations SET ${sets.join(', ')} WHERE id = ?${values.length - 1} AND project_id = ?${values.length}`)
    .bind(...values)
    .run();
  return readDestination(db, projectId, id);
}

export async function deleteDestination(db: D1Database, projectId: string, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM destinations WHERE id = ?1 AND project_id = ?2')
    .bind(id, projectId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ---------- Deliveries ----------

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

export interface DeliveryRow {
  id: string;
  feedback_id: string;
  destination_id: string;
  status: DeliveryStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  destination_id: string;
  destination_kind: DestinationKind | null;
  status: DeliveryStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export async function createDeliveries(db: D1Database, feedbackId: string, destinationIds: string[]): Promise<DeliveryRow[]> {
  if (destinationIds.length === 0) return [];
  const now = nowIso();
  const statements = destinationIds.map((destinationId) =>
    db
      .prepare(
        `INSERT INTO deliveries (id, feedback_id, destination_id, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'pending', 0, ?4, ?4, ?4)`,
      )
      .bind(crypto.randomUUID(), feedbackId, destinationId, now),
  );
  await db.batch(statements);
  return listDeliveriesForFeedback(db, feedbackId);
}

export async function listDeliveriesForFeedback(db: D1Database, feedbackId: string): Promise<DeliveryRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM deliveries WHERE feedback_id = ?1 ORDER BY created_at ASC')
    .bind(feedbackId)
    .all<DeliveryRow>();
  return results;
}

export async function listDeliveriesWithKinds(db: D1Database, feedbackId: string): Promise<Delivery[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, dest.kind AS destination_kind FROM deliveries d
       LEFT JOIN destinations dest ON dest.id = d.destination_id
       WHERE d.feedback_id = ?1 ORDER BY d.created_at ASC`,
    )
    .bind(feedbackId)
    .all<DeliveryRow & { destination_kind: DestinationKind | null }>();
  return results.map((row) => ({
    id: row.id,
    destination_id: row.destination_id,
    destination_kind: row.destination_kind,
    status: row.status,
    attempts: row.attempts,
    next_attempt_at: row.next_attempt_at,
    last_error: row.last_error,
    delivered_at: row.delivered_at,
    created_at: row.created_at,
  }));
}

export async function listDueDeliveries(db: D1Database, feedbackId: string | null, limit: number): Promise<DeliveryRow[]> {
  const now = nowIso();
  const statement = feedbackId
    ? db
        .prepare(
          `SELECT * FROM deliveries WHERE feedback_id = ?1 AND status IN ('pending', 'failed')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?2) ORDER BY created_at ASC LIMIT ${limit}`,
        )
        .bind(feedbackId, now)
    : db
        .prepare(
          `SELECT * FROM deliveries WHERE status IN ('pending', 'failed')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?1) ORDER BY next_attempt_at ASC LIMIT ${limit}`,
        )
        .bind(now);
  const { results } = await statement.all<DeliveryRow>();
  return results;
}

export async function markDeliveryDelivered(db: D1Database, id: string, attempts: number): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE deliveries SET status = 'delivered', attempts = ?2, delivered_at = ?3, last_error = NULL,
         next_attempt_at = NULL, updated_at = ?3 WHERE id = ?1`,
    )
    .bind(id, attempts, now)
    .run();
}

export async function markDeliveryFailed(
  db: D1Database,
  id: string,
  attempts: number,
  error: string,
  nextAttemptAt: string | null,
): Promise<void> {
  const now = nowIso();
  const status: DeliveryStatus = nextAttemptAt ? 'failed' : 'exhausted';
  await db
    .prepare(
      `UPDATE deliveries SET status = ?2, attempts = ?3, last_error = ?4, next_attempt_at = ?5, updated_at = ?6
       WHERE id = ?1`,
    )
    .bind(id, status, attempts, error.slice(0, 200), nextAttemptAt, now)
    .run();
}

export async function requeueFailedDeliveries(db: D1Database, feedbackId: string): Promise<number> {
  const now = nowIso();
  const result = await db
    .prepare(
      `UPDATE deliveries SET status = 'pending', next_attempt_at = ?2, updated_at = ?2
       WHERE feedback_id = ?1 AND status IN ('failed', 'exhausted')`,
    )
    .bind(feedbackId, now)
    .run();
  return result.meta.changes ?? 0;
}

// ---------- Sessions ----------

export async function createSession(db: D1Database, id: string, expiresAt: string): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (id, expires_at, created_at) VALUES (?1, ?2, ?3)')
    .bind(id, expiresAt, nowIso())
    .run();
}

export async function readSession(db: D1Database, id: string): Promise<{ id: string; expires_at: string } | null> {
  return db.prepare('SELECT id, expires_at FROM sessions WHERE id = ?1').bind(id).first<{ id: string; expires_at: string }>();
}

export async function deleteSession(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?1').bind(id).run();
}

export async function deleteExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(nowIso()).run();
}
