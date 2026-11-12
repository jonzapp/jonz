import "server-only";

import { tool } from "ai";
import { PAGE_IDS, type PageId } from "@app/core";
import { z } from "zod";

/**
 * read_page for Jonz's own assistants (Ask Jonz, the owner's Ask Jonz, the
 * support agent): the same pages, under the same name, that a connected
 * app reads with read_page over MCP (packages/core/src/pages.ts).
 */
const ABOUT =
  "One page of Jonz, in Markdown, word for word what people read: a guide topic (how a part of the app works) or help, privacy or terms (reaching Jonz, connecting an AI assistant, what Jonz keeps, the rules). Read the topic before explaining a rule, so you explain what the app really does.";

/** In a house: the guide uses this house's own numbers. */
export function readPageTool(read: (page: PageId) => string) {
  return tool({
    description: `${ABOUT} Guide topics use this house's own numbers.`,
    inputSchema: z.object({ page: z.enum(PAGE_IDS) }),
    execute: async ({ page }) => read(page),
  });
}

/** Outside any house (the owner, support): the guide uses a new house's settings, a family's when asked. */
export function readPageToolForAnyHouse(read: (page: PageId, family: boolean) => string) {
  return tool({
    description: `${ABOUT} Guide topics use a new house's settings.`,
    inputSchema: z.object({ page: z.enum(PAGE_IDS), family: z.boolean().describe("True for how it works in a family.") }),
    execute: async ({ page, family }) => read(page, family),
  });
}
