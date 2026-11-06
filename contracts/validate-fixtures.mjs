// Structural validation of the golden fixtures without external dependencies.
// The server test suite validates the same fixtures against its zod schemas,
// and the Swift tests decode them; this script is the dependency-free gate.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const fixture = async (name) => JSON.parse(await readFile(join(root, "fixtures", name), "utf8"));
const fail = (message) => { throw new Error(message); };
const scalars = (value) => [...value].length;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = ["feedback", "bug", "idea"];

function checkContext(context, label) {
  if (!context || typeof context !== "object") fail(`${label}: context missing`);
  const limits = { app_version: [1, 40], build_number: [1, 40], os_version: [1, 80], locale: [2, 80], device_family: [1, 80] };
  for (const [field, [min, max]] of Object.entries(limits)) {
    const value = context[field];
    if (typeof value !== "string" || scalars(value) < min || scalars(value) > max) fail(`${label}: context.${field} invalid`);
  }
  if (context.device_model !== undefined && context.device_model !== null) {
    if (typeof context.device_model !== "string" || scalars(context.device_model) < 1 || scalars(context.device_model) > 80) fail(`${label}: device_model invalid`);
  }
  const allowed = new Set([...Object.keys(limits), "device_model"]);
  for (const key of Object.keys(context)) if (!allowed.has(key)) fail(`${label}: unexpected context.${key}`);
}

function checkUser(user, label, { requireAll }) {
  if (user === undefined) { if (requireAll) fail(`${label}: user missing`); return; }
  if (!user || typeof user !== "object") fail(`${label}: user invalid`);
  const allowed = new Set(["id", "account_status", "plan", "entitlements", "attributes"]);
  for (const key of Object.keys(user)) if (!allowed.has(key)) fail(`${label}: unexpected user.${key}`);
  if (user.id != null && (typeof user.id !== "string" || scalars(user.id) < 1 || scalars(user.id) > 200)) fail(`${label}: user.id invalid`);
  if (user.account_status !== undefined && !["unknown", "free", "paid"].includes(user.account_status)) fail(`${label}: account_status invalid`);
  if (user.plan != null && (typeof user.plan !== "string" || scalars(user.plan) > 200)) fail(`${label}: plan invalid`);
  if (user.entitlements !== undefined) {
    if (!Array.isArray(user.entitlements) || user.entitlements.length > 20) fail(`${label}: entitlements invalid`);
    for (const item of user.entitlements) if (typeof item !== "string" || scalars(item) < 1 || scalars(item) > 200) fail(`${label}: entitlement invalid`);
  }
  if (user.attributes !== undefined) {
    const entries = Object.entries(user.attributes ?? {});
    if (entries.length > 20) fail(`${label}: too many attributes`);
    for (const [key, value] of entries) {
      if (scalars(key) < 1 || scalars(key) > 80 || typeof value !== "string" || scalars(value) > 500) fail(`${label}: attribute ${key} invalid`);
    }
  }
  if (requireAll) for (const key of allowed) if (!(key in user)) fail(`${label}: user.${key} missing`);
}

function checkSubmission(submission, label) {
  const allowed = new Set(["schema_version", "category", "message", "name", "reply_email", "context", "user"]);
  for (const key of Object.keys(submission)) if (!allowed.has(key)) fail(`${label}: unexpected ${key}`);
  if (submission.schema_version !== 1) fail(`${label}: schema_version`);
  if (!categories.includes(submission.category)) fail(`${label}: category`);
  if (typeof submission.message !== "string" || scalars(submission.message) < 4 || scalars(submission.message) > 2000) fail(`${label}: message`);
  if (submission.name != null && (typeof submission.name !== "string" || scalars(submission.name) < 1 || scalars(submission.name) > 120)) fail(`${label}: name`);
  if (submission.reply_email != null) {
    const email = submission.reply_email;
    if (typeof email !== "string" || scalars(email) > 254 || /\s/.test(email) || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) fail(`${label}: reply_email`);
  }
  checkContext(submission.context, label);
  checkUser(submission.user, label, { requireAll: false });
}

function checkFeedbackObject(feedback, label) {
  const required = ["id", "key", "number", "project_id", "category", "status", "message", "name", "reply_email", "context", "user", "attachment", "internal_note", "created_at", "updated_at"];
  for (const key of required) if (!(key in feedback)) fail(`${label}: ${key} missing`);
  for (const key of Object.keys(feedback)) if (!required.includes(key)) fail(`${label}: unexpected ${key}`);
  if (!uuid.test(feedback.id)) fail(`${label}: id`);
  if (!categories.includes(feedback.category)) fail(`${label}: category`);
  if (!["todo", "in_progress", "done", "wont_do"].includes(feedback.status)) fail(`${label}: status`);
  if (typeof feedback.key !== "string" || !/^[A-Z0-9]{2,6}-\d+$/.test(feedback.key)) fail(`${label}: key`);
  if (!Number.isInteger(feedback.number) || feedback.number < 1) fail(`${label}: number`);
  checkContext(feedback.context, label);
  checkUser(feedback.user, label, { requireAll: true });
  if (feedback.attachment !== null) {
    const { content_type, byte_count, url, ...rest } = feedback.attachment;
    if (Object.keys(rest).length) fail(`${label}: attachment extra keys`);
    if (!["image/jpeg", "image/png"].includes(content_type)) fail(`${label}: attachment content_type`);
    if (!Number.isInteger(byte_count) || byte_count < 4 || byte_count > 1_500_000) fail(`${label}: attachment byte_count`);
    if (typeof url !== "string") fail(`${label}: attachment url`);
  }
  if (Number.isNaN(Date.parse(feedback.created_at)) || Number.isNaN(Date.parse(feedback.updated_at))) fail(`${label}: timestamps`);
}

checkSubmission(await fixture("minimum-valid-submission.json"), "minimum-valid-submission");
checkSubmission(await fixture("full-submission.json"), "full-submission");

const receipt = await fixture("accepted-receipt.json");
if (!uuid.test(receipt.feedback_id) || typeof receipt.duplicate !== "boolean" || typeof receipt.delivery_status !== "string") fail("accepted-receipt invalid");

checkFeedbackObject(await fixture("feedback-object.json"), "feedback-object");

const event = await fixture("webhook-event-v1.json");
if (event.schema_version !== 1 || event.type !== "feedback.created" || !uuid.test(event.id)) fail("webhook-event header invalid");
if (Number.isNaN(Date.parse(event.occurred_at))) fail("webhook-event occurred_at");
for (const key of ["id", "slug", "name"]) if (typeof event.project?.[key] !== "string") fail(`webhook-event project.${key}`);
checkFeedbackObject(event.data, "webhook-event.data");

console.log("Contract fixtures are structurally valid.");
