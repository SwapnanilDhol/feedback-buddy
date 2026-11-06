# feedback-buddy-mcp

An MCP server that gives agents (Claude Code, Claude Desktop, Cursor, anything
that speaks MCP) read and triage access to a FeedbackBuddy inbox.

Tools: `overview`, `list_projects`, `list_feedback`, `get_feedback`,
`get_attachment` (returns the screenshot as an image), `update_feedback`,
`delete_feedback`, `create_project`. Projects can be referenced by slug, name,
bundle id or id.

## Run

```bash
cd mcp && npm install && npm run build
FEEDBACK_ADMIN_TOKEN=… node dist/index.js        # stdio
```

`FEEDBACK_BASE_URL` defaults to the hosted Worker.

## Claude Code

Project-level `.mcp.json` (already in this repo) or user-level:

```bash
claude mcp add feedback-buddy -s user -e FEEDBACK_ADMIN_TOKEN=… -- node /path/to/feedback-buddy/mcp/dist/index.js
```

## Claude Desktop

```json
{ "mcpServers": { "feedback-buddy": { "command": "node", "args": ["/path/to/feedback-buddy/mcp/dist/index.js"], "env": { "FEEDBACK_ADMIN_TOKEN": "…" } } } }
```

The token is the operator `ADMIN_API_TOKEN`; it can read everything and change
status, so keep it in your own config, never in an app.
