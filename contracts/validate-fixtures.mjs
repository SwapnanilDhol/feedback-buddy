import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const fixture = async (name) => JSON.parse(await readFile(join(root, "fixtures", name), "utf8"));

const submission = await fixture("minimum-valid-submission.json");
if (submission.schema_version !== 1 || !["feedback", "bug", "idea"].includes(submission.category)) throw new Error("invalid submission fixture");
if (typeof submission.message !== "string" || [...submission.message].length < 4) throw new Error("invalid message fixture");
for (const field of ["app_version", "build_number", "os_version", "locale", "device_family"]) {
  if (typeof submission.context?.[field] !== "string" || submission.context[field].length === 0) throw new Error(`invalid context fixture: ${field}`);
}

const receipt = await fixture("accepted-receipt.json");
if (receipt.delivery_status !== "accepted" || typeof receipt.feedback_id !== "string") throw new Error("invalid receipt fixture");

const event = await fixture("webhook-event-v1.json");
if (event.schema_version !== 1 || event.type !== "feedback.created" || !event.data?.feedback_id) throw new Error("invalid webhook fixture");

console.log("Contract fixtures are structurally valid.");
