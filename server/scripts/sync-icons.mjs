#!/usr/bin/env node
// Looks up App Store icons from this machine and stores them on the projects.
// Useful when Apple throttles the Worker's shared egress address.
//
//   FEEDBACK_BASE_URL=https://feedback-buddy.swapnanildhol.workers.dev \
//   FEEDBACK_ADMIN_TOKEN=... node scripts/sync-icons.mjs [--all]
const base = (process.env.FEEDBACK_BASE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const token = process.env.FEEDBACK_ADMIN_TOKEN;
if (!token) { console.error('FEEDBACK_ADMIN_TOKEN is required'); process.exit(1); }
const all = process.argv.includes('--all');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'feedback-buddy-sync-icons/1.0' };

const listed = await fetch(`${base}/api/v1/projects`, { headers });
if (!listed.ok) { console.error('list failed', listed.status, await listed.text()); process.exit(1); }
const { projects } = await listed.json();

let updated = 0;
for (const project of projects) {
  if (!project.bundle_id || (project.icon_url && !all)) continue;
  const lookup = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(project.bundle_id)}&entity=software`);
  if (!lookup.ok) { console.log(`  ${project.slug}: lookup ${lookup.status}`); continue; }
  const result = (await lookup.json()).results?.[0];
  const artwork = result?.artworkUrl512 ?? result?.artworkUrl100 ?? result?.artworkUrl60;
  if (!artwork) { console.log(`  ${project.slug}: not on the App Store`); continue; }
  const icon = artwork.replace(/\/\d+x\d+(bb)?(-\d+)?\.(png|jpg|jpeg|webp)$/i, '/256x256bb.png');
  const patch = await fetch(`${base}/api/v1/projects/${project.id}`, { method: 'PATCH', headers, body: JSON.stringify({ icon_url: icon }) });
  console.log(`  ${project.slug}: ${patch.ok ? 'updated' : `PATCH ${patch.status}`}`);
  if (patch.ok) updated += 1;
  await new Promise((resolve) => setTimeout(resolve, 1500)); // stay well under Apple's rate limit
}
console.log(`${updated} icon${updated === 1 ? '' : 's'} updated.`);
