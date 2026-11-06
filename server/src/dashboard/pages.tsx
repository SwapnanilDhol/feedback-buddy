import type { FC } from 'hono/jsx';

import type { Passkey } from '../passkeys';
import type { ApiKey, Delivery, Destination, Feedback, Project, ProjectCounts } from '../repository';
import type { Category, ListFeedbackQuery } from '../schema';
import { categories, statuses } from '../schema';
import type { OverviewStats } from '../repository';
import { AppIcon, BackLink, PageHead } from './layout';

type ProjectWithCounts = Project & { counts: ProjectCounts };

/** Kept for Slack formatting and the API; the dashboard itself uses coloured dots. */
export const categoryEmoji: Record<Category, string> = { feedback: '💬', bug: '🐞', idea: '💡' };

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return iso.slice(0, 10);
}

export function excerpt(message: string, length = 140): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}


const CategoryTag: FC<{ category: Category }> = ({ category }) => (
  <span class="cat">
    <span class={`dot ${category}`}></span>
    {category}
  </span>
);

function versionLabel(feedback: Feedback): string {
  return `${feedback.context.app_version} (${feedback.context.build_number})`;
}

function deviceLabel(feedback: Feedback): string {
  return `${feedback.context.device_family} · ${feedback.context.os_version}`;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const OverviewPage: FC<{
  projects: ProjectWithCounts[];
  stats: OverviewStats;
  latest: Array<{ feedback: Feedback; project: ProjectWithCounts }>;
}> = ({ projects, stats, latest }) => (
  <>
    <PageHead title="Overview" meta={`${projects.length} ${projects.length === 1 ? 'app' : 'apps'} · ${stats.new} new ${stats.new === 1 ? 'message' : 'messages'}`} />

    <div class="stats">
      <div class="stat"><div class="k">New</div><div class={`v ${stats.new > 0 ? 'accent' : ''}`}>{stats.new}</div></div>
      <div class="stat"><div class="k">Open bugs</div><div class={`v ${stats.open_bugs > 0 ? 'warn' : ''}`}>{stats.open_bugs}</div></div>
      <div class="stat"><div class="k">Last 7 days</div><div class="v">{stats.last_7_days}</div></div>
      <div class="stat"><div class="k">Awaiting reply</div><div class="v">{stats.awaiting_reply}</div></div>
    </div>

    <div class="section-title"><h2>Latest</h2><span class="muted small">across all apps</span></div>
    <div class="panel stream">
      {latest.length === 0 ? <div class="empty">{projects.length === 0 ? 'Add an app to start receiving feedback.' : 'No feedback yet. It will show up here the moment it arrives.'}</div> : null}
      <ul class="rows">
        {latest.map(({ feedback, project }) => (
          <li>
            <a class="r" href={`/p/${project.id}/f/${feedback.id}`}>
              <AppIcon project={project} />
              <span style="min-width: 0">
                <div class="title">{excerpt(feedback.message, 110)}</div>
                <div class="sub">
                  {project.name} · <CategoryTag category={feedback.category} />
                  {feedback.name ? ` · ${feedback.name}` : ''}
                  {' · '}{versionLabel(feedback)}
                </div>
              </span>
              <span class="end">
                <span>{relativeTime(feedback.created_at)}</span>
                <span class={`pill ${feedback.status}`}>{feedback.status}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>

    <div class="section-title"><h2>Apps</h2><a href="/apps/new">New app</a></div>
    {projects.length === 0 ? <div class="panel"><div class="empty">No apps yet.</div></div> : null}
    <div class="apps">
      {projects.map((project) => (
        <a class="app" href={`/p/${project.id}`} title={`${project.counts.new} new · ${project.counts.triaged} triaged · ${project.counts.closed} closed`}>
          <AppIcon project={project} size="lg" />
          <span style="min-width: 0">
            <div class="title">{project.name}</div>
            <div class="sub">
              {project.counts.new > 0 ? <b>{project.counts.new} new</b> : <span>0 new</span>}
              {project.counts.triaged > 0 ? ` · ${project.counts.triaged} triaged` : ''}
              {project.counts.new === 0 && project.counts.triaged === 0 ? ` · ${project.counts.closed} closed` : ''}
            </div>
          </span>
        </a>
      ))}
    </div>
  </>
);

export const NewAppPage: FC = () => (
  <>
    <PageHead crumb={<BackLink href="/" label="Overview" />} title="New app" meta="One project per app. You get a public key to paste into the app." />
    <div class="panel">
      <form method="post" action="/projects" class="pad">
        <div class="form-row" style="grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 150px">
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" required maxlength={80} placeholder="Goaley" autofocus />
          </div>
          <div class="field">
            <label for="bundle_id">Bundle identifier</label>
            <input id="bundle_id" name="bundle_id" maxlength={120} placeholder="com.example.app" />
          </div>
          <div class="field">
            <label for="retention_days">Retention (days)</label>
            <input id="retention_days" name="retention_days" type="number" min={1} max={365} value="30" />
          </div>
        </div>
        <p class="hint small" style="margin-top: 10px">The bundle identifier is optional, but with it the app icon is fetched from the App Store automatically.</p>
        <div class="form-actions">
          <button class="primary" type="submit">Create app</button>
          <a class="btn" href="/">Cancel</a>
        </div>
      </form>
    </div>
  </>
);

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export const InboxPage: FC<{
  project: Project;
  feedback: Feedback[];
  query: ListFeedbackQuery;
  nextCursor: string | null;
  appVersions: string[];
}> = ({ project, feedback, query, nextCursor, appVersions }) => {
  const nextParams = new URLSearchParams();
  if (query.status) nextParams.set('status', query.status);
  if (query.category) nextParams.set('category', query.category);
  if (query.app_version) nextParams.set('app_version', query.app_version);
  if (query.q) nextParams.set('q', query.q);
  if (nextCursor) nextParams.set('cursor', nextCursor);
  const filtered = Boolean(query.status || query.category || query.app_version || query.q);
  return (
    <>
      <PageHead crumb={<BackLink href="/" label="Overview" />} title={project.name} meta={project.bundle_id ?? project.slug} icon={<AppIcon project={project} size="xl" />}>
        <a class="btn" href={`/p/${project.id}/settings`}>Settings</a>
      </PageHead>
      <div class="panel">
        <form method="get" action={`/p/${project.id}`} class="filters" data-autosubmit>
          <select name="status" aria-label="Status">
            <option value="">Any status</option>
            {statuses.map((status) => (
              <option value={status} selected={query.status === status}>{status}</option>
            ))}
          </select>
          <select name="category" aria-label="Category">
            <option value="">Any category</option>
            {categories.map((category) => (
              <option value={category} selected={query.category === category}>{category}</option>
            ))}
          </select>
          <select name="app_version" aria-label="Version">
            <option value="">Any version</option>
            {appVersions.map((version) => (
              <option value={version} selected={query.app_version === version}>{version}</option>
            ))}
          </select>
          <input class="q" name="q" value={query.q ?? ''} maxlength={200} placeholder="Search message, name, email" aria-label="Search" />
          <a class={`reset ${filtered ? 'show' : ''}`} href={`/p/${project.id}`}>Clear</a>
        </form>
        {feedback.length === 0 ? (
          <div class="empty">{filtered ? 'No feedback matches these filters.' : 'Feedback from the app will appear here as it arrives.'}</div>
        ) : null}
        <ul class="rows">
          {feedback.map((item) => (
            <li>
              <a class="r" href={`/p/${project.id}/f/${item.id}`} style="grid-template-columns: minmax(0, 1fr) auto">
                <span style="min-width: 0">
                  <div class="title">{excerpt(item.message, 120)}</div>
                  <div class="sub">
                    <CategoryTag category={item.category} />
                    {' · '}
                    {item.name ? `${item.name} · ` : ''}
                    {versionLabel(item)} · {deviceLabel(item)}
                    {item.user.account_status === 'paid' ? ' · paid' : ''}
                    {item.attachment ? ' · image' : ''}
                  </div>
                </span>
                <span class="end">
                  <span>{relativeTime(item.created_at)}</span>
                  <span class={`pill ${item.status}`}>{item.status}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {nextCursor ? (
          <div class="pad" style="border-top: 1px solid var(--line); display: flex; justify-content: center">
            <a class="btn" href={`/p/${project.id}?${nextParams.toString()}`}>Older</a>
          </div>
        ) : null}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export const FeedbackDetailPage: FC<{ project: Project; feedback: Feedback; deliveries: Delivery[] }> = ({ project, feedback, deliveries }) => {
  const reference = feedback.id.slice(0, 8).toUpperCase();
  const mailto = feedback.reply_email
    ? `mailto:${encodeURIComponent(feedback.reply_email)}?subject=${encodeURIComponent(`Re: your ${project.name} feedback ${reference}`)}`
    : null;
  const failed = deliveries.some((delivery) => delivery.status === 'failed' || delivery.status === 'exhausted');
  return (
    <>
      <PageHead
        crumb={<BackLink href={`/p/${project.id}`} label={`${project.name} inbox`} />}
        title={`${feedback.category[0]!.toUpperCase()}${feedback.category.slice(1)} · ${reference}`}
        meta={`${relativeTime(feedback.created_at)} · ${feedback.created_at.replace('T', ' ').slice(0, 16)} UTC`}
      >
        <span class={`pill ${feedback.status}`}>{feedback.status}</span>
      </PageHead>

      <div class="panel">
        <div class="pad">
          <p class="message">{feedback.message}</p>
          {feedback.attachment ? (
            <div class="attachment">
              <a href={feedback.attachment.url} target="_blank" rel="noopener" class="frame">
                <img src={feedback.attachment.url} alt="Attached image" loading="lazy" />
              </a>
              <p class="hint small" style="margin-top: 6px">
                {feedback.attachment.content_type} · {Math.round(feedback.attachment.byte_count / 1024)} KB
              </p>
            </div>
          ) : null}
        </div>
        <div class="panel-head" style="border-top: 1px solid var(--line); border-bottom: 0">
          <form method="post" action={`/p/${project.id}/f/${feedback.id}/status`} class="seg">
            {statuses.map((status) => (
              <button type="submit" name="status" value={status} class={feedback.status === status ? 'on' : ''} disabled={feedback.status === status}>
                Mark {status}
              </button>
            ))}
          </form>
          <div class="right">
            {mailto ? <a class="btn" href={mailto}>Reply by email</a> : <span class="hint">No reply email</span>}
            <form method="post" action={`/p/${project.id}/f/${feedback.id}/delete`}>
              <button class="quiet danger" type="submit" data-confirm="Delete this feedback and its image permanently?">Delete</button>
            </form>
          </div>
        </div>
      </div>

      <div class="panel facts">
        <div>
          <h3>Context</h3>
          <dl>
            <dt>Version</dt><dd>{versionLabel(feedback)}</dd>
            <dt>Device</dt><dd>{feedback.context.device_family}{feedback.context.device_model ? ` · ${feedback.context.device_model}` : ''}</dd>
            <dt>OS</dt><dd>{feedback.context.os_version}</dd>
            <dt>Locale</dt><dd>{feedback.context.locale}</dd>
          </dl>
        </div>
        <div>
          <h3>Person</h3>
          <dl>
            <dt>Name</dt><dd>{feedback.name ?? '—'}</dd>
            <dt>Email</dt><dd>{feedback.reply_email ?? '—'}</dd>
            <dt>User ID</dt><dd>{feedback.user.id ? <code>{feedback.user.id}</code> : '—'}</dd>
            <dt>Account</dt><dd>{feedback.user.account_status}{feedback.user.plan ? ` · ${feedback.user.plan}` : ''}</dd>
            <dt>Entitlements</dt><dd>{feedback.user.entitlements.length ? feedback.user.entitlements.join(', ') : '—'}</dd>
            {Object.entries(feedback.user.attributes).map(([key, value]) => (
              <><dt>{key}</dt><dd>{value}</dd></>
            ))}
          </dl>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Internal note</h2></div>
        <form method="post" action={`/p/${project.id}/f/${feedback.id}/note`} class="pad">
          <textarea name="internal_note" rows={3} maxlength={4000} placeholder="Only visible here and in the admin API.">{feedback.internal_note ?? ''}</textarea>
          <div class="form-actions"><button type="submit">Save note</button></div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Deliveries</h2>
          {failed ? (
            <form method="post" action={`/p/${project.id}/f/${feedback.id}/redeliver`} class="right">
              <button type="submit">Retry failed</button>
            </form>
          ) : null}
        </div>
        {deliveries.length === 0 ? <div class="empty">No destinations were configured when this arrived.</div> : null}
        <ul class="rows">
          {deliveries.map((delivery) => (
            <li>
              <div class="r" style="grid-template-columns: minmax(0, 1fr) auto">
                <span style="min-width: 0">
                  <div class="title">{delivery.destination_kind === 'slack_webhook' ? 'Slack' : delivery.destination_kind === 'webhook' ? 'Webhook' : delivery.destination_kind === 'email' ? 'Email' : 'Removed destination'}</div>
                  <div class="sub">
                    {delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'}
                    {delivery.last_error ? ` · ${delivery.last_error}` : ''}
                    {delivery.next_attempt_at && delivery.status === 'failed' ? ` · retry ${relativeTime(delivery.next_attempt_at).replace(' ago', '')}` : ''}
                  </div>
                </span>
                <span class="end"><span class={`pill ${delivery.status}`}>{delivery.status}</span></span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

/** Must match `FeedbackConfiguration.defaultEndpoint` in the Swift package. */
export const SDK_DEFAULT_ENDPOINT = 'https://feedback-buddy.swapnanildhol.workers.dev';

export function swiftSnippet(publicKeyPlaceholder: string, baseUrl: string): string {
  const endpointArgument = baseUrl.replace(/\/+$/, '') === SDK_DEFAULT_ENDPOINT
    ? ''
    : `, endpoint: URL(string: "${baseUrl}")!`;
  return `import FeedbackBuddy

// At launch
FeedbackBuddy.configure(apiKey: "${publicKeyPlaceholder}"${endpointArgument})

// UIKit
FeedbackBuddy.present(from: viewController)
// SwiftUI
.feedbackBuddySheet(isPresented: $showFeedback)`;
}

export const SettingsPage: FC<{
  project: Project;
  keys: ApiKey[];
  destinations: Destination[];
  baseUrl: string;
  newKey: string | null;
}> = ({ project, keys, destinations, baseUrl, newKey }) => (
  <>
    <PageHead
      crumb={<BackLink href={`/p/${project.id}`} label={`${project.name} inbox`} />}
      title={`${project.name} settings`}
      meta={project.bundle_id ?? project.slug}
      icon={<AppIcon project={project} size="xl" />}
    />

    <div class="panel">
      <div class="panel-head">
        <h2>Integrate</h2>
        <div class="right"><button type="button" data-copy="snippet">Copy</button></div>
      </div>
      <div class="pad">
        <p class="hint" style="margin-bottom: 10px">Add the <code>FeedbackBuddy</code> Swift package, then:</p>
        <pre id="snippet">{swiftSnippet(newKey ?? `${keys.find((key) => !key.revoked_at)?.prefix ?? 'fb_pub_'}…`, baseUrl)}</pre>
        {!newKey ? <p class="hint small" style="margin-top: 8px">The key is abbreviated; use the full key from when it was created, or create a new one below.</p> : null}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Public keys</h2>
        <form method="post" action={`/p/${project.id}/keys`} class="right">
          <button type="submit">New key</button>
        </form>
      </div>
      <ul class="rows">
        {keys.map((key) => (
          <li>
            <div class="r" style="grid-template-columns: minmax(0, 1fr) auto">
              <span style="min-width: 0">
                <div class="title"><code>{key.prefix}…</code></div>
                <div class="sub">Created {relativeTime(key.created_at)}</div>
              </span>
              <span class="end">
                {key.revoked_at ? (
                  <span class="pill off">revoked</span>
                ) : (
                  <form method="post" action={`/p/${project.id}/keys/${key.id}/revoke`}>
                    <button class="danger" type="submit" data-confirm="Revoke this key? Apps using it will stop sending feedback.">Revoke</button>
                  </form>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Destinations</h2></div>
      {destinations.length === 0 ? <div class="empty">None yet. Feedback is stored here either way.</div> : null}
      <ul class="rows">
        {destinations.map((destination) => (
          <li>
            <div class="r" style="grid-template-columns: minmax(0, 1fr) auto">
              <span style="min-width: 0">
                <div class="title">{destination.kind === 'slack_webhook' ? 'Slack' : destination.kind === 'email' ? 'Email' : 'Webhook'} <span class="muted" style="font-weight: 400">· {destination.categories.length ? destination.categories.join(', ') : 'all categories'}</span></div>
                <div class="sub">{destination.url}</div>
              </span>
              <span class="end">
                <span class={`pill ${destination.enabled ? 'closed' : 'off'}`}>{destination.enabled ? 'on' : 'off'}</span>
                <form method="post" action={`/p/${project.id}/destinations/${destination.id}/test`}><button class="quiet" type="submit">Test</button></form>
                <form method="post" action={`/p/${project.id}/destinations/${destination.id}/toggle`}><button class="quiet" type="submit">{destination.enabled ? 'Disable' : 'Enable'}</button></form>
                <form method="post" action={`/p/${project.id}/destinations/${destination.id}/delete`}><button class="quiet danger" type="submit" data-confirm="Remove this destination?">Remove</button></form>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <form method="post" action={`/p/${project.id}/destinations`} class="pad" style="border-top: 1px solid var(--line)">
        <div class="form-row" style="grid-template-columns: 190px minmax(0, 1fr) 200px">
          <div class="field">
            <label for="kind">Kind</label>
            <select id="kind" name="kind">
              <option value="email">Email</option>
              <option value="slack_webhook">Slack incoming webhook</option>
              <option value="webhook">Signed webhook</option>
            </select>
          </div>
          <div class="field">
            <label for="url">Address or URL</label>
            <input id="url" name="url" required placeholder="you@example.com or https://hooks.slack.com/…" />
          </div>
          <div class="field">
            <label for="secret">Secret (webhooks only)</label>
            <input id="secret" name="secret" type="password" autocomplete="off" placeholder="at least 8 characters" />
          </div>
        </div>
        <div class="form-actions" style="justify-content: space-between">
          <span style="display: inline-flex; gap: 14px">
            {categories.map((category) => (
              <label class="check"><input type="checkbox" name="categories" value={category} /> {category}</label>
            ))}
            <span class="hint small">none checked = all</span>
          </span>
          <button type="submit">Add destination</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Project</h2></div>
      <form method="post" action={`/p/${project.id}/settings`} class="pad">
        <div class="form-row" style="grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 150px auto">
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" value={project.name} required maxlength={80} />
          </div>
          <div class="field">
            <label for="bundle_id">Bundle identifier</label>
            <input id="bundle_id" name="bundle_id" value={project.bundle_id ?? ''} maxlength={120} />
          </div>
          <div class="field">
            <label for="retention_days">Retention (days)</label>
            <input id="retention_days" name="retention_days" type="number" min={1} max={365} value={String(project.retention_days)} />
          </div>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  </>
);

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export const SecurityPage: FC<{ passkeys: Passkey[] }> = ({ passkeys }) => (
  <>
    <PageHead crumb={<BackLink href="/" label="Overview" />} title="Security" meta="How you sign in. Apps use project keys and never see this." />
    <div class="panel">
      <div class="panel-head"><h2>Passkeys</h2></div>
      {passkeys.length === 0 ? (
        <div class="empty">No passkeys yet. The password works until you add one and stays as a recovery option after.</div>
      ) : null}
      <ul class="rows">
        {passkeys.map((passkey) => (
          <li>
            <div class="r" style="grid-template-columns: minmax(0, 1fr) auto">
              <span style="min-width: 0">
                <div class="title">{passkey.name}</div>
                <div class="sub">
                  {passkey.device_type === 'multiDevice' ? 'Synced passkey' : 'Device-bound passkey'}
                  {' · added '}
                  {relativeTime(passkey.created_at)}
                  {passkey.last_used_at ? ` · last used ${relativeTime(passkey.last_used_at)}` : ' · never used'}
                </div>
              </span>
              <span class="end">
                <form method="post" action={`/security/passkeys/${encodeURIComponent(passkey.id)}/delete`}>
                  <button class="quiet danger" type="submit" data-confirm={`Remove the passkey “${passkey.name}”?`}>Remove</button>
                </form>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <form id="passkey-add" class="pad" style="border-top: 1px solid var(--line)">
        <div class="form-row" style="grid-template-columns: minmax(0, 1fr) auto">
          <div class="field">
            <label for="passkey-name">Add a passkey</label>
            <input id="passkey-name" name="name" maxlength={60} placeholder="Name it, e.g. iPhone" />
          </div>
          <button class="primary" type="submit">Add passkey</button>
        </div>
        <p class="status" id="passkey-add-status"></p>
        <p class="hint small">Uses Face ID, Touch ID or your device PIN and syncs through iCloud Keychain. Bound to this dashboard’s address; enrol again if it changes.</p>
      </form>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Password</h2></div>
      <div class="pad hint">
        The operator password is the <code>ADMIN_PASSWORD</code> secret on the Worker and remains the recovery path. Rotate it with <code>npx wrangler secret put ADMIN_PASSWORD</code>.
        Scripts and agents use <code>ADMIN_API_TOKEN</code> and are unaffected by passkeys.
      </div>
    </div>
  </>
);
