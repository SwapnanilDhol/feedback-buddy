#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { FeedbackBuddyClient } from './client.js';
import { createServer } from './server.js';

const baseUrl = process.env.FEEDBACK_BASE_URL ?? 'https://feedback-buddy.swapnanildhol.workers.dev';
const token = process.env.FEEDBACK_ADMIN_TOKEN;
if (!token) {
  process.stderr.write('feedback-buddy-mcp: set FEEDBACK_ADMIN_TOKEN (and optionally FEEDBACK_BASE_URL)\n');
  process.exit(1);
}

const server = createServer(new FeedbackBuddyClient({ baseUrl, token }));
await server.connect(new StdioServerTransport());
