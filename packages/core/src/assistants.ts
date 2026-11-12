/** Where Claude, ChatGPT or any app that speaks MCP connects to Jonz. */
export const MCP_ADDRESS = "https://api.jonz.app/mcp";

/**
 * The AI assistants Jonz shows how to connect, on You (Connected apps) and
 * on jonz.app/help: each one's name, and where its own settings open. Its
 * steps and note are words (people.connectApp.<id>.steps, .note, .open),
 * the steps in Markdown with the address where {address} is. To add an
 * assistant, add it here and give it those words; nothing else changes.
 */
export const ASSISTANTS = [
  { id: "claude", name: "Claude", settings: "https://claude.ai/settings/connectors" },
  { id: "chatgpt", name: "ChatGPT", settings: "https://chatgpt.com/#settings" },
] as const;

export type Assistant = (typeof ASSISTANTS)[number];
export type AssistantId = Assistant["id"];
