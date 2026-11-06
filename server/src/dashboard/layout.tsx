import { raw } from 'hono/html';
import type { FC, PropsWithChildren } from 'hono/jsx';

import type { Project, ProjectCounts } from '../repository';
import { statusLabels, type Status } from '../schema';

// ---------------------------------------------------------------------------
// Design tokens. One neutral palette, one accent, a 4px spacing scale, and a
// fixed page skeleton so navigating between pages never moves anything.
// ---------------------------------------------------------------------------

const stylesheet = `
:root {
  color-scheme: light dark;
  --bg: #fafafa; --panel: #ffffff; --hover: #f4f4f4; --ink: #121212; --ink-2: #4a4a4a; --muted: #7a7a7a; --line: #e7e7e7; --line-2: #d9d9d9;
  --accent: #121212; --accent-ink: #ffffff; --link: #1f5eff; --focus: #1f5eff;
  --new: #1f5eff; --triaged: #c77d00; --closed: #1f8a4c; --done: #6e56cf; --danger: #d2362b;
  --radius: 10px; --radius-s: 7px; --control: 32px; --side: 232px;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #111111; --panel: #171717; --hover: #1f1f1f; --ink: #ececec; --ink-2: #bdbdbd; --muted: #8f8f8f; --line: #262626; --line-2: #333333;
  --accent: #ececec; --accent-ink: #111111; --link: #7aa2ff; --focus: #7aa2ff;
  --new: #7aa2ff; --triaged: #e2a33a; --closed: #5fc38a; --done: #a394f0; --danger: #ff6b5e;
} }

* { box-sizing: border-box; }
html { scrollbar-gutter: stable; -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif; color: var(--ink); background: var(--bg); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
a.link { color: var(--link); } a.link:hover { text-decoration: underline; }
h1, h2, h3, p { margin: 0; }
code, pre { font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
code { background: var(--hover); border-radius: 4px; padding: 1px 5px; }
pre { background: var(--hover); border-radius: var(--radius-s); padding: 12px 14px; overflow-x: auto; max-width: 100%; white-space: pre; }
pre code { background: none; padding: 0; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }

/* Shell */
.shell { display: grid; grid-template-columns: var(--side) minmax(0, 1fr); min-height: 100vh; }
.side { position: sticky; top: 0; height: 100vh; overflow-y: auto; scrollbar-gutter: stable; background: var(--panel); border-right: 1px solid var(--line); padding: 24px 12px 16px; display: flex; flex-direction: column; }
.brand { display: block; font-weight: 600; font-size: 14px; line-height: 20px; padding: 0 8px 20px; color: var(--ink); }
.nav-label { display: block; font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: var(--muted); padding: 10px 8px 4px; }
.nav a { display: grid; grid-template-columns: 8px 1fr auto; gap: 10px; align-items: center; height: 32px; padding: 0 8px; border-radius: var(--radius-s); color: var(--ink-2); font-size: 13.5px; }
.nav a:hover { background: var(--hover); color: var(--ink); }
.nav a.active { background: var(--hover); color: var(--ink); font-weight: 500; }
.nav .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav .n { font-size: 12px; color: var(--muted); min-width: 1.6em; text-align: right; font-variant-numeric: tabular-nums; }
.nav .n.has { color: var(--new); font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.side .foot { margin-top: auto; padding-top: 12px; }
.main { padding: 24px 36px 64px; width: 100%; max-width: 920px; min-width: 0; }

/* Page skeleton: identical height on every page */
.head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 16px; margin-bottom: 20px; }
.head .crumb { font-size: 12.5px; color: var(--muted); height: 20px; line-height: 20px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.head .crumb a:hover { color: var(--ink); }
.head h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.3px; line-height: 28px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head .meta { font-size: 13px; color: var(--muted); height: 20px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head .actions { display: flex; gap: 8px; align-items: center; padding-bottom: 8px; }
.head .titlerow { display: flex; align-items: center; gap: 14px; min-width: 0; min-height: 48px; }

/* Panels */
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 16px; min-width: 0; }
.panel > .pad { padding: 16px 20px; }
.panel-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 48px; padding: 8px 20px; border-bottom: 1px solid var(--line); }
.panel-head h2 { font-size: 14px; font-weight: 600; }
.panel-head .right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.panel .hint { font-size: 13px; color: var(--muted); }

/* Rows */
.rows { list-style: none; margin: 0; padding: 0; }
.rows > li { border-top: 1px solid var(--line); }
.rows > li:first-child { border-top: 0; }
.rows .r { display: grid; align-items: center; gap: 12px; min-height: 48px; padding: 10px 20px; }
a.r:hover { background: var(--hover); }
.r .title { font-size: 14px; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r .sub { font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.r .end { display: flex; gap: 14px; align-items: center; justify-content: flex-end; font-size: 12.5px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.empty { padding: 36px 20px; text-align: center; color: var(--muted); font-size: 13.5px; }

/* Workflow status badges (Linear-style icon + label). */
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); white-space: nowrap; line-height: 1; }
.pill svg { width: 14px; height: 14px; flex: none; }
.pill.todo { color: var(--muted); } .pill.in_progress { color: var(--triaged); } .pill.done { color: var(--done); } .pill.wont_do { color: var(--muted); }
.pill.delivered, .pill.pending, .pill.failed, .pill.exhausted, .pill.off { padding-left: 13px; position: relative; }
.pill.delivered::before, .pill.pending::before, .pill.failed::before, .pill.exhausted::before, .pill.off::before { content: ""; position: absolute; left: 0; top: 50%; margin-top: -3.5px; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pill.delivered { color: var(--closed); } .pill.pending { color: var(--triaged); } .pill.failed, .pill.exhausted { color: var(--danger); } .pill.off { color: var(--muted); }
.badge-select { display: inline-flex; align-items: center; gap: 8px; height: var(--control); padding: 0 10px; border: 1px solid var(--line-2); border-radius: var(--radius-s); background: var(--panel); }
.badge-select select { width: auto; height: auto; border: 0; padding: 0 22px 0 0; background-color: transparent; font-weight: 500; font-size: 13.5px; background-position: right 4px center, right 0 center; }
.key { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); white-space: nowrap; letter-spacing: 0; }
.issue { display: grid; grid-template-columns: 16px 64px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 44px; padding: 0 20px; color: var(--ink); }
.issue:hover { background: var(--hover); }
.issue .pill { gap: 0; } .issue .pill svg { width: 15px; height: 15px; }
.issue .title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.issue .title .who { color: var(--muted); font-weight: 400; }
.issue .title .icon { vertical-align: -5px; margin-right: 6px; }
.issue .end { display: flex; align-items: center; gap: 12px; font-size: 12.5px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.issue .end .img { width: 14px; height: 14px; opacity: .7; }
.rows > li.issue-row { border-top: 1px solid var(--line); }
.cat { font-size: 12.5px; color: var(--muted); text-transform: capitalize; display: inline-flex; align-items: center; gap: 6px; }
.cat .dot.feedback { background: var(--new); } .cat .dot.bug { background: var(--danger); } .cat .dot.idea { background: var(--triaged); }

/* Controls: one height everywhere */
button, .btn { font: inherit; font-size: 13px; font-weight: 500; height: var(--control); padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--line-2); background: var(--panel); color: var(--ink); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
button:hover, .btn:hover { background: var(--hover); }
button.primary, .btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
button.primary:hover, .btn.primary:hover { opacity: .9; background: var(--accent); }
button.quiet { border-color: transparent; background: transparent; color: var(--ink-2); } button.quiet:hover { background: var(--hover); color: var(--ink); }
button.danger { color: var(--danger); }
button:disabled { opacity: .45; cursor: default; }
button.on { background: var(--hover); border-color: var(--line-2); font-weight: 600; }
.seg { display: inline-flex; } .seg button { border-radius: 0; margin-left: -1px; } .seg button:first-child { border-radius: var(--radius-s) 0 0 var(--radius-s); margin-left: 0; } .seg button:last-child { border-radius: 0 var(--radius-s) var(--radius-s) 0; }
input, select, textarea { font: inherit; font-size: 13.5px; height: var(--control); padding: 0 10px; border-radius: var(--radius-s); border: 1px solid var(--line-2); background: var(--panel); color: var(--ink); width: 100%; }
textarea { height: auto; padding: 8px 10px; line-height: 1.5; resize: vertical; }
input::placeholder, textarea::placeholder { color: var(--muted); }
select { appearance: none; -webkit-appearance: none; padding-right: 26px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 13px) 13px, calc(100% - 9px) 13px; background-size: 4px 4px; background-repeat: no-repeat; }
label { display: block; font-size: 12px; font-weight: 500; color: var(--muted); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.field { min-width: 0; }
.form-row { display: grid; gap: 12px; align-items: end; }
.check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); margin: 0; }
.check input { width: 14px; height: 14px; margin: 0; }
.form-actions { display: flex; gap: 8px; align-items: center; margin-top: 14px; }

/* Filters bar */
.filters { display: grid; grid-template-columns: 120px 120px 120px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); }
.filters .reset { font-size: 12.5px; color: var(--muted); height: var(--control); display: inline-flex; align-items: center; padding: 0 4px; visibility: hidden; }
.filters .reset.show { visibility: visible; } .filters .reset:hover { color: var(--ink); }

/* Detail */
.message { white-space: pre-wrap; font-size: 15px; line-height: 1.6; }
.attachment { margin-top: 16px; }
.attachment .frame { background: var(--hover); border-radius: var(--radius-s); min-height: 160px; display: grid; place-items: center; overflow: hidden; }
.attachment img { display: block; max-width: 100%; max-height: 440px; }
.facts { display: grid; grid-template-columns: 1fr 1fr; }
.facts > div { padding: 14px 20px; }
.facts > div + div { border-left: 1px solid var(--line); }
.facts h3 { font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
dl { margin: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); row-gap: 6px; column-gap: 12px; font-size: 13.5px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }

/* Flash: fixed, never affects layout */
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: var(--bg); font-size: 13px; padding: 10px 14px; border-radius: 8px; max-width: min(520px, calc(100vw - 32px)); box-shadow: 0 8px 24px rgba(0,0,0,.18); z-index: 10; }
.toast.error { background: var(--danger); color: #fff; }
.toast.hide { opacity: 0; transition: opacity .25s ease; }
.keybox { border: 1px solid var(--line-2); border-radius: var(--radius); padding: 14px 20px; margin-bottom: 16px; background: var(--panel); }
.keybox .k { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; background: var(--hover); border-radius: var(--radius-s); padding: 8px 10px; margin: 8px 0 10px; }
.status { min-height: 20px; font-size: 13px; color: var(--muted); margin-top: 10px; } .status.error { color: var(--danger); }

/* Login */
.login-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.login { width: 100%; max-width: 340px; }
.login .brand { padding: 0 0 16px; font-size: 15px; }
.login .panel > .pad { padding: 22px; }
.login h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; } .login .lead { font-size: 13.5px; color: var(--muted); margin-bottom: 18px; }
.login .alt { margin-top: 14px; font-size: 12.5px; color: var(--muted); }
.w100 { width: 100%; justify-content: center; }
.muted { color: var(--muted); } .small { font-size: 12.5px; }

/* Cross-document page transitions: a short crossfade, nothing when reduced motion is on. */
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 160ms; animation-timing-function: ease; }
::view-transition-old(root) { animation-name: fb-fade-out; } ::view-transition-new(root) { animation-name: fb-fade-in; }
@keyframes fb-fade-out { to { opacity: 0; } } @keyframes fb-fade-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { ::view-transition-old(root), ::view-transition-new(root) { animation: none; } }
.side, .toast { view-transition-name: none; }

/* App icons: Apple artwork when known, a tinted square with a dot otherwise. Both rounded like iOS. */
.icon { width: 20px; height: 20px; border-radius: 22%; flex: none; display: inline-grid; place-items: center; background: var(--hover); box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); overflow: hidden; }
.icon img { width: 100%; height: 100%; display: block; object-fit: cover; }
.icon .dot { width: 7px; height: 7px; }
.icon.lg { width: 36px; height: 36px; border-radius: 22%; } .icon.lg .dot { width: 10px; height: 10px; }
.icon.xl { width: 44px; height: 44px; } .icon.xl .dot { width: 12px; height: 12px; }

/* Stats */
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
.stat .k { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat .v { font-size: 24px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.2; margin-top: 2px; font-variant-numeric: tabular-nums; }
.stat .v.accent { color: var(--new); } .stat .v.warn { color: var(--danger); }

/* Back link in page headers */
.back { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); }
.back:hover { color: var(--ink); }
.back svg { width: 12px; height: 12px; }

/* Sidebar additions */
.nav a.new-app { color: var(--muted); } .nav a.new-app:hover { color: var(--ink); }
.nav a.new-app .plus { width: 20px; height: 20px; border-radius: 22%; border: 1px dashed var(--line-2); display: inline-grid; place-items: center; font-size: 14px; line-height: 1; }
.nav a { grid-template-columns: 20px 1fr auto; }

/* Apps grid on overview */
.apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.app { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; align-items: center; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; }
.app:hover { background: var(--hover); }
.app .title { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app .sub { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app .sub b { color: var(--new); font-weight: 600; }
.section-title { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; }
.section-title h2 { font-size: 13px; font-weight: 600; color: var(--ink); } .section-title a { font-size: 12.5px; color: var(--muted); } .section-title a:hover { color: var(--ink); }
.stream .r { grid-template-columns: 20px minmax(0, 1fr) auto; }

@media (max-width: 820px) {
  .shell { grid-template-columns: 1fr; }
  /* Sidebar becomes a compact header: brand + sign out on one line, app chips below. */
  .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 10px 16px 12px; display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .brand { flex: 1; padding: 0; }
  .side .foot { order: 2; margin: 0; padding: 0; border: 0; }
  .nav { order: 3; flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; }
  .nav-label { display: none; }
  .nav a { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px 0 7px; font-size: 13px; border: 1px solid var(--line); border-radius: 15px; }
  .nav a .icon { width: 18px; height: 18px; }
  .nav .n { min-width: 0; margin-left: 2px; } .nav .n:empty { display: none; }
  .nav a.new-app .plus { display: none; } .nav a.new-app { padding-left: 10px; }
  .nav a[href="/security"] > span:first-child { display: none; } .nav a[href="/security"] { padding-left: 10px; }
  .main { padding: 16px 16px 48px; }
  .head { grid-template-columns: 1fr; gap: 10px; margin-bottom: 16px; }
  .head .actions { padding: 0; }
  .head .actions:empty { display: none; }
  .stats { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat { padding: 12px 14px; } .stat .v { font-size: 22px; }
  .filters { grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 16px; }
  .filters .q { grid-column: 1 / -1; }
  .filters .reset { justify-self: end; }
  .filters .reset:not(.show) { display: none; }
  .panel > .pad, .rows .r, .facts > div { padding-left: 16px; padding-right: 16px; }
  .panel-head { padding: 8px 16px; }
  .rows .r { grid-template-columns: minmax(0, 1fr) !important; row-gap: 6px; }
  .issue { grid-template-columns: 16px minmax(0, 1fr); padding: 10px 16px; row-gap: 4px; }
  .issue .key { display: none; }
  .issue .title { white-space: normal; }
  .issue .end { grid-column: 2; }
  .stream .r { grid-template-columns: 20px minmax(0, 1fr) !important; }
  .r .end { grid-column: 1 / -1; justify-content: flex-start; gap: 10px; flex-wrap: wrap; }
  .stream .r .end { grid-column: 2; }
  .r .title, .r .sub { white-space: normal; }
  .seg { width: 100%; } .seg button { flex: 1; justify-content: center; padding: 0 6px; }
  .panel-head:has(.seg) .right { margin-left: 0; width: 100%; justify-content: flex-end; }
  .form-row > button { justify-self: start; }
  .form-row { grid-template-columns: 1fr !important; }
  .form-actions { flex-wrap: wrap; }
  .facts { grid-template-columns: 1fr; } .facts > div + div { border-left: 0; border-top: 1px solid var(--line); }
  dl { grid-template-columns: 96px minmax(0, 1fr); }
  .apps { grid-template-columns: 1fr 1fr; gap: 10px; } .app { padding: 10px 12px; gap: 10px; }
  /* 16px inputs stop iOS Safari from zooming the page on focus. */
  input, select, textarea { font-size: 16px; }
  .toast { bottom: 16px; }
}
@media (max-width: 420px) { .apps { grid-template-columns: 1fr; } .stats { gap: 8px; } }
`;

const script = `
(function () {
  // Click delegation works across swaps; per-element bindings are (re)applied by enhance().
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) return;
    var copy = target.closest('[data-copy]');
    if (copy) {
      var source = document.getElementById(copy.getAttribute('data-copy'));
      if (source && navigator.clipboard) {
        navigator.clipboard.writeText(source.textContent || '').then(function () {
          var original = copy.textContent; copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = original; }, 1200);
        });
      }
    }
    var confirmable = target.closest('[data-confirm]');
    if (confirmable && !window.confirm(confirmable.getAttribute('data-confirm'))) { event.preventDefault(); }
  });

  window.fbEnhance = function (root) {
    root.querySelectorAll('form[data-autosubmit] select').forEach(function (select) {
      if (select.dataset.bound) return; select.dataset.bound = '1';
      select.addEventListener('change', function () { select.form.requestSubmit ? select.form.requestSubmit() : select.form.submit(); });
    });
    var toast = root.querySelector('.toast');
    if (toast && !toast.dataset.bound) { toast.dataset.bound = '1'; setTimeout(function () { toast.classList.add('hide'); }, 3600); setTimeout(function () { toast.remove(); }, 4000); }
    if (window.fbEnhancePasskeys) window.fbEnhancePasskeys();
  };
  window.fbEnhance(document);

  // Client-side navigation: same-origin links fetch the next page and swap it in
  // place, so there is no full reload. Visited pages are kept in memory and
  // Back/Forward restore them instantly, scroll position included.
  var cache = new Map();
  var current = { url: location.href };
  function cacheable(doc) { return doc.querySelector('.main') && doc.querySelector('.side'); }
  function snapshot() {
    if (!cacheable(document)) return;
    cache.set(current.url, { title: document.title, main: document.querySelector('.main').innerHTML, side: document.querySelector('.side').innerHTML, scroll: window.scrollY, at: Date.now() });
  }
  function render(page, scroll) {
    var apply = function () {
      document.title = page.title;
      document.querySelector('.main').innerHTML = page.main;
      document.querySelector('.side').innerHTML = page.side;
      window.scrollTo(0, scroll);
      window.fbEnhance(document);
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply); else apply();
  }
  var inflight = new Map();
  function fetchPage(url) {
    if (inflight.has(url)) return inflight.get(url);
    var promise = fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'fb-nav' } }).then(function (response) {
      if (!response.ok || response.redirected) throw new Error('navigate');
      return response.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (!cacheable(doc)) throw new Error('navigate');
      return { title: doc.title, main: doc.querySelector('.main').innerHTML, side: doc.querySelector('.side').innerHTML, scroll: 0, at: Date.now() };
    }).finally(function () { inflight.delete(url); });
    inflight.set(url, promise);
    return promise;
  }
  function go(url, push) {
    snapshot();
    var cached = cache.get(url);
    var fromCache = !push && cached;
    var showPage = function (page, scroll) { current = { url: url }; render(page, scroll); };
    if (fromCache) { showPage(cached, cached.scroll); return; }
    fetchPage(url).then(function (page) { cache.set(url, page); if (push) history.pushState({ fb: true }, '', url); showPage(page, 0); })
      .catch(function () { location.href = url; });
  }
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.target || link.hasAttribute('download') || link.dataset.native !== undefined) return;
    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname === '/login' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) return;
    if (url.href === location.href) { event.preventDefault(); return; }
    event.preventDefault();
    go(url.href, true);
  });
  document.addEventListener('mouseover', function (event) {
    var link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.target || link.dataset.native !== undefined) return;
    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname === '/login' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/') || cache.has(url.href) || url.href === location.href) return;
    fetchPage(url.href).then(function (page) { cache.set(url.href, page); }).catch(function () {});
  });
  // GET forms (filters, search) navigate in place too, without empty parameters in the URL.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || (form.method || 'get').toLowerCase() !== 'get' || event.defaultPrevented) return;
    var url = new URL(form.action || location.href, location.href);
    if (url.origin !== location.origin) return;
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, key) { if (typeof value === 'string' && value !== '') params.append(key, value); });
    url.search = params.toString();
    event.preventDefault();
    go(url.href, true);
  });
  window.addEventListener('popstate', function () { go(location.href, false); });
  if (!history.state || !history.state.fb) history.replaceState({ fb: true }, '', location.href);
})();
`;

export const passkeyScript = `
window.fbEnhancePasskeys = function () {
  function toBuffer(value) {
    var s = value.replace(/-/g, '+').replace(/_/g, '/');
    var pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    var bin = atob(s + pad); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function fromBuffer(buffer) {
    var bytes = new Uint8Array(buffer); var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  async function post(url, body) {
    var response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body || {}) });
    var data = {}; try { data = await response.json(); } catch (e) {}
    if (!response.ok) throw new Error(data.error || ('http_' + response.status));
    return data;
  }
  function credentialJSON(credential) {
    var r = credential.response;
    var out = { id: credential.id, rawId: fromBuffer(credential.rawId), type: credential.type, clientExtensionResults: credential.getClientExtensionResults(), response: { clientDataJSON: fromBuffer(r.clientDataJSON) } };
    if (credential.authenticatorAttachment) out.authenticatorAttachment = credential.authenticatorAttachment;
    if (r.attestationObject) { out.response.attestationObject = fromBuffer(r.attestationObject); if (r.getTransports) out.response.transports = r.getTransports(); }
    if (r.authenticatorData) { out.response.authenticatorData = fromBuffer(r.authenticatorData); out.response.signature = fromBuffer(r.signature); if (r.userHandle) out.response.userHandle = fromBuffer(r.userHandle); }
    return out;
  }
  function explain(error) {
    var name = error && error.name;
    if (name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.';
    if (name === 'InvalidStateError') return 'This device already has a passkey for FeedbackBuddy.';
    var code = error && error.message;
    if (code === 'passkey_rejected') return 'That passkey was not accepted.';
    if (code === 'challenge_missing') return 'The sign-in request expired. Try again.';
    if (code === 'rate_limited') return 'Too many attempts. Try again in a few minutes.';
    if (code === 'unauthorized') return 'Your session expired. Sign in again.';
    return 'Something went wrong: ' + (code || 'unknown error') + '.';
  }
  function status(id, text, isError) { var el = document.getElementById(id); if (!el) return; el.textContent = text; el.className = 'status' + (isError ? ' error' : ''); }
  var supported = !!(window.PublicKeyCredential && navigator.credentials);
  var loginButton = document.getElementById('passkey-login');
  if (loginButton && !loginButton.dataset.bound) {
    loginButton.dataset.bound = '1';
    if (!supported) { loginButton.disabled = true; status('passkey-status', 'This browser does not support passkeys. Use the password instead.', true); }
    loginButton.addEventListener('click', async function () {
      loginButton.disabled = true; status('passkey-status', 'Waiting for your passkey…');
      try {
        var options = await post('/auth/passkey/options');
        options.challenge = toBuffer(options.challenge);
        (options.allowCredentials || []).forEach(function (c) { c.id = toBuffer(c.id); });
        var credential = await navigator.credentials.get({ publicKey: options });
        var result = await post('/auth/passkey/verify', credentialJSON(credential));
        location.href = result.redirect || '/';
      } catch (error) { status('passkey-status', explain(error), true); loginButton.disabled = false; }
    });
  }
  var addForm = document.getElementById('passkey-add');
  if (addForm && !addForm.dataset.bound) {
    addForm.dataset.bound = '1';
    var addButton = addForm.querySelector('button');
    if (!supported) { addButton.disabled = true; status('passkey-add-status', 'This browser does not support passkeys.', true); }
    addForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      addButton.disabled = true; status('passkey-add-status', 'Follow the prompt on your device…');
      try {
        var options = await post('/security/passkeys/options');
        options.challenge = toBuffer(options.challenge);
        options.user.id = toBuffer(options.user.id);
        (options.excludeCredentials || []).forEach(function (c) { c.id = toBuffer(c.id); });
        var credential = await navigator.credentials.create({ publicKey: options });
        await post('/security/passkeys', { name: addForm.querySelector('[name=name]').value, response: credentialJSON(credential) });
        location.href = '/security';
      } catch (error) { status('passkey-add-status', explain(error), true); addButton.disabled = false; }
    });
  }
};
window.fbEnhancePasskeys();
`;

/** Stable hue per slug so each app keeps its colour everywhere. */
export function hue(slug: string): number {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function dotStyle(slug: string): string {
  return `background: hsl(${hue(slug)} 55% 50%)`;
}

/** Apple artwork when cached, otherwise a tinted square with the app's colour dot. */
export const AppIcon: FC<{ project: Pick<Project, 'slug' | 'name' | 'icon_url'>; size?: 'sm' | 'lg' | 'xl' }> = ({ project, size = 'sm' }) => (
  <span class={`icon ${size === 'sm' ? '' : size}`} aria-hidden="true">
    {project.icon_url ? <img src={project.icon_url} alt="" loading="lazy" width={size === 'sm' ? 20 : size === 'lg' ? 36 : 44} height={size === 'sm' ? 20 : size === 'lg' ? 36 : 44} /> : <span class="dot" style={dotStyle(project.slug)}></span>}
  </span>
);

const StatusIcon: FC<{ status: Status }> = ({ status }) => {
  switch (status) {
    case 'todo':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.5 2.2" /></svg>
      );
    case 'in_progress':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8 8V2.6A5.4 5.4 0 0 1 13.4 8Z" fill="currentColor" /></svg>
      );
    case 'done':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="currentColor" /><path d="M5 8.2l2 2 4-4.4" fill="none" stroke="var(--panel)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      );
    case 'wont_do':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      );
  }
};

/** Icon + label for a workflow status; `iconOnly` for dense rows. */
export const StatusBadge: FC<{ status: Status; iconOnly?: boolean }> = ({ status, iconOnly }) => (
  <span class={`pill ${status}`} title={statusLabels[status]}>
    <StatusIcon status={status} />
    {iconOnly ? null : <span>{statusLabels[status]}</span>}
  </span>
);

export const BackLink: FC<{ href: string; label: string }> = ({ href, label }) => (
  <a class="back" href={href}>
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5" /></svg>
    <span>{label}</span>
  </a>
);

export interface Flash {
  kind: 'info' | 'error' | 'key';
  text: string;
}

export interface LayoutProps {
  title: string;
  projects: Array<Project & { counts: ProjectCounts }>;
  activeProjectId?: string;
  activeNav?: 'overview' | 'new' | 'security';
  flash?: Flash | null;
}

const Head: FC<{ title: string }> = ({ title }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>{title} · FeedbackBuddy</title>
    <style dangerouslySetInnerHTML={{ __html: stylesheet }} />
  </head>
);

// Without a doctype browsers render in Quirks Mode, which adds default
// margins to forms and changes box sizing in places; always emit one.
const doctype = raw('<!DOCTYPE html>');

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, projects, activeProjectId, activeNav, flash, children }) => (
  <>
  {doctype}
  <html lang="en">
    <Head title={title} />
    <body>
      <div class="shell">
        <aside class="side">
          <a class="brand" href="/">FeedbackBuddy</a>
          <nav class="nav">
            <a href="/" class={activeNav === 'overview' ? 'active' : ''}>
              <span class="icon"><span class="dot" style="background: var(--ink); width: 6px; height: 6px"></span></span>
              <span class="name">Overview</span>
              <span class="n"></span>
            </a>
            <span class="nav-label">Apps</span>
            {projects.map((project) => (
              <a href={`/p/${project.id}`} class={project.id === activeProjectId ? 'active' : ''} title={project.name}>
                <AppIcon project={project} />
                <span class="name">{project.name}</span>
                <span class={`n ${project.counts.todo > 0 ? 'has' : ''}`}>{project.counts.todo > 0 ? project.counts.todo : ''}</span>
              </a>
            ))}
            <a href="/apps/new" class={`new-app ${activeNav === 'new' ? 'active' : ''}`}>
              <span class="plus">+</span>
              <span class="name">New app</span>
              <span class="n"></span>
            </a>
            <span class="nav-label">Account</span>
            <a href="/security" class={activeNav === 'security' ? 'active' : ''}>
              <span></span>
              <span class="name">Security</span>
              <span class="n"></span>
            </a>
          </nav>
          <form method="post" action="/logout" class="foot">
            <button class="quiet" type="submit">Sign out</button>
          </form>
        </aside>
        <main class="main">
          {flash?.kind === 'key' ? <KeyBox value={flash.text} /> : null}
          {children}
        </main>
      </div>
      {flash && flash.kind !== 'key' ? <div class={`toast ${flash.kind === 'error' ? 'error' : ''}`} role="status">{flash.text}</div> : null}
      <script dangerouslySetInnerHTML={{ __html: passkeyScript }} />
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </body>
  </html>
  </>
);

const KeyBox: FC<{ value: string }> = ({ value }) => (
  <div class="keybox">
    <h2 style="font-size: 14px; font-weight: 600">New public key</h2>
    <p class="hint small">Copy it now. It is shown once and stored only as a hash.</p>
    <div class="k" id="new-key">{value}</div>
    <button type="button" data-copy="new-key">Copy key</button>
  </div>
);

/** Consistent page header: breadcrumb line, title, meta line, optional actions. */
export const PageHead: FC<PropsWithChildren<{ crumb?: unknown; title: string; meta?: string | null; icon?: unknown }>> = ({ crumb, title, meta, icon, children }) => (
  <div class="head">
    <div style="min-width: 0">
      <div class="crumb">{crumb ?? null}</div>
      <div class="titlerow">
        {icon ?? null}
        <div style="min-width: 0">
          <h1>{title}</h1>
          <div class="meta">{meta ?? ''}</div>
        </div>
      </div>
    </div>
    <div class="actions">{children}</div>
  </div>
);

export const LoginPage: FC<{ error?: string | null; hasPasskeys: boolean; showPassword: boolean }> = ({ error, hasPasskeys, showPassword }) => (
  <>
  {doctype}
  <html lang="en">
    <Head title="Sign in" />
    <body class="login-shell">
      <div class="login">
        <div class="brand">FeedbackBuddy</div>
        <div class="panel">
          <div class="pad">
            <h1>Sign in</h1>
            <p class="lead">Your feedback inbox, across every app.</p>
            {error ? <p class="small" style="color: var(--danger); margin-bottom: 12px">{error}</p> : null}
            {hasPasskeys && !showPassword ? (
              <div>
                <button class="primary w100" type="button" id="passkey-login">Continue with passkey</button>
                <p class="status" id="passkey-status"></p>
                <p class="alt"><a class="link" href="/login?password=1">Use the password instead</a></p>
              </div>
            ) : (
              <form method="post" action="/login">
                <label for="password">Password</label>
                <input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
                <div class="form-actions">
                  <button class="primary w100" type="submit">Sign in</button>
                </div>
                {hasPasskeys ? <p class="alt"><a class="link" href="/login">Use a passkey instead</a></p> : null}
              </form>
            )}
          </div>
        </div>
      </div>
      {hasPasskeys ? <script dangerouslySetInnerHTML={{ __html: passkeyScript }} /> : null}
    </body>
  </html>
  </>
);
