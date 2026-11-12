# Jonz in ChatGPT's app directory

What OpenAI's plugin portal (platform.openai.com/plugins) takes to list Jonz:
`plugin.json` (the listing, test cases and countries), `mcp.json` (the
server, `https://api.jonz.app/mcp`, signing in by OAuth with automatic
registration) and the logos. `npm run package:chatgpt` zips them into
`jonz-chatgpt.zip` at the repo root, which is what you upload.

`apps/api/tests/unit/directories.test.ts` holds this package, and every tool
/mcp offers, to Claude's and ChatGPT's directory rules. The steps to submit,
and Claude's own listing, are in docs/specs/assistant-directories.md.
