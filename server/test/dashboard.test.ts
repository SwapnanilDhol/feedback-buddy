import { describe, expect, it } from 'vitest';

import { call, createProject, login, submit, validSubmission } from './helpers';

describe('dashboard', () => {
  it('redirects anonymous visitors and rejects a wrong password', async () => {
    const anonymous = await call('/');
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get('Location')).toBe('/login');
    expect((await call('/login')).status).toBe(200);
    const wrong = await login('nope');
    expect(wrong.response.status).toBe(401);
    expect(wrong.response.headers.get('Set-Cookie')).toBeNull();
  });

  it('signs in with a secure cookie and renders projects', async () => {
    const project = await createProject('Dashboard Project');
    const { response, cookie } = await login();
    expect(response.status).toBe(303);
    const setCookie = response.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('fb_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');

    const home = await call('/', { headers: { Cookie: cookie } });
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('Dashboard Project');
    expect(html).toContain(`/p/${project.id}`);

    const logout = await call('/logout', { method: 'POST', headers: { Cookie: cookie } });
    expect(logout.status).toBe(303);
    expect((await call('/', { headers: { Cookie: cookie } })).status).toBe(302);
  });

  it('renders the inbox and detail with user content escaped', async () => {
    const project = await createProject('Escaped Project');
    const { body } = await submit(project.public_key, { ...validSubmission, message: 'Hello <script>alert(1)</script> & goodbye', name: '<b>Bold</b>' });
    const { cookie } = await login();
    const inbox = await call(`/p/${project.id}`, { headers: { Cookie: cookie } });
    expect(inbox.status).toBe(200);
    const inboxHtml = await inbox.text();
    expect(inboxHtml).not.toContain('<script>alert(1)</script>');
    expect(inboxHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(inboxHtml).toContain(`/p/${project.id}/f/${body.feedback_id}`);

    const filtered = await call(`/p/${project.id}?status=done&category=bug`, { headers: { Cookie: cookie } });
    expect(await filtered.text()).toContain('No feedback matches');

    const detail = await call(`/p/${project.id}/f/${body.feedback_id}`, { headers: { Cookie: cookie } });
    expect(detail.status).toBe(200);
    const detailHtml = await detail.text();
    expect(detailHtml).toContain('&lt;b&gt;Bold&lt;/b&gt;');
    expect(detailHtml).toContain('In Progress');
    expect(detailHtml).toMatch(/[A-Z0-9]{2,6}-\d+/);

    const status = await call(`/p/${project.id}/f/${body.feedback_id}/status`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'status=in_progress',
    });
    expect(status.status).toBe(303);
    const after = await call(`/p/${project.id}/f/${body.feedback_id}`, { headers: { Cookie: cookie } });
    expect(await after.text()).toContain('pill in_progress');

    const otherProject = await createProject();
    expect((await call(`/p/${otherProject.id}/f/${body.feedback_id}`, { headers: { Cookie: cookie } })).status).toBe(404);
  });

  it('renders the settings page with the Swift snippet and creates projects from the form', async () => {
    const project = await createProject('Snippet Project');
    const { cookie } = await login();
    const settings = await call(`/p/${project.id}/settings`, { headers: { Cookie: cookie } });
    const html = await settings.text();
    expect(html).toContain('import FeedbackBuddy');
    expect(html).toContain('FeedbackBuddy.configure(apiKey:');
    expect(html).toContain('https://feedback.test');
    expect(html).toContain(project.public_key.slice(0, 12));
    expect(html).not.toContain(project.public_key);

    const created = await call('/projects', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Form Project', bundle_id: 'com.example.form', retention_days: '14' }).toString(),
    });
    expect(created.status).toBe(303);
    const location = created.headers.get('Location') ?? '';
    expect(location).toMatch(/^\/p\/prj_[A-Za-z0-9_-]+\/settings$/);
    const flashCookie = (created.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    const shown = await call(location, { headers: { Cookie: `${cookie}; ${flashCookie}` } });
    const shownHtml = await shown.text();
    expect(shownHtml).toContain('New public key');
    expect(shownHtml).toMatch(/fb_pub_[A-Za-z0-9_-]{24}/);
    const again = await call(location, { headers: { Cookie: cookie } });
    expect(await again.text()).not.toContain('New public key');
  });
});

describe('swiftSnippet', () => {
  it('omits the endpoint argument when the base URL is the SDK default', async () => {
    const { swiftSnippet, SDK_DEFAULT_ENDPOINT } = await import('../src/dashboard/pages');
    expect(swiftSnippet('fb_pub_abc…', SDK_DEFAULT_ENDPOINT)).toContain('FeedbackBuddy.configure(apiKey: "fb_pub_abc…")');
    expect(swiftSnippet('fb_pub_abc…', `${SDK_DEFAULT_ENDPOINT}/`)).not.toContain('endpoint:');
    expect(swiftSnippet('fb_pub_abc…', 'http://localhost:8787')).toContain('endpoint: URL(string: "http://localhost:8787")!');
  });
});

describe('flash cookie', () => {
  it('survives non-Latin-1 text such as curly quotes and emoji', async () => {
    const { cookie } = await login();
    const created = await call('/projects', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Émoji “App” 🚀', retention_days: 'not-a-number' }).toString(),
    });
    expect(created.status).toBe(303);
    expect(created.headers.get('Location')).toBe('/apps/new');
    const flash = (created.headers.get('Set-Cookie') ?? '').split(/,(?=\s*\w+=)/).find((part) => part.trim().startsWith('fb_flash='))?.split(';')[0] ?? '';
    const page = await call('/apps/new', { headers: { Cookie: `${cookie}; ${flash}` } });
    expect(await page.text()).toContain('Check the project name and retention days.');
  });
});

describe('overview', () => {
  it('shows stats, the latest messages from every app, and the app grid', async () => {
    const alpha = await createProject('Alpha App');
    const beta = await createProject('Beta App');
    await submit(alpha.public_key, { ...validSubmission, message: 'Alpha bug message for the overview' });
    await submit(beta.public_key, { ...validSubmission, category: 'idea', message: 'Beta idea message for the overview', reply_email: 'b@example.com' });
    const { cookie } = await login();
    const html = await (await call('/', { headers: { Cookie: cookie } })).text();
    expect(html).toContain('Alpha bug message for the overview');
    expect(html).toContain('Beta idea message for the overview');
    expect(html).toContain('Open bugs');
    expect(html).toContain('Awaiting reply');
    expect(html).toContain(`/p/${alpha.id}`);
    expect(html).toContain('href="/apps/new"');
    const form = await (await call('/apps/new', { headers: { Cookie: cookie } })).text();
    expect(form).toContain('action="/projects"');
  });
});
