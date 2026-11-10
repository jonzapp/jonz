import { z } from "zod";

import { OPERATIONS, type OperationName } from "./operations";

// Approving a connected app's request (docs/specs/operation-registry.md,
// "MCP"): an app the person connected to Jonz asked to do something that
// can't be undone, and Jonz held it until the person says yes here, at
// jonz.app/approve/<id>, signed in to Jonz itself.

/** An approval page's path, as the MCP server links to it. */
export const APPROVE_PATH = /^\/approve\/[0-9a-f-]{36}$/;

export const approvePath = (id: string) => `/approve/${id}`;

/** One request, as api_approval answers it. */
export const ApprovalRow = z.object({
  id: z.uuid(),
  operation: z.string(),
  input: z.record(z.string(), z.unknown()),
  house_id: z.uuid().nullable(),
  house_name: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  approved_at: z.string().nullable(),
  declined_at: z.string().nullable(),
  used_at: z.string().nullable(),
});
export type ApprovalRow = z.infer<typeof ApprovalRow>;

/** Where a request stands, for the page to say. */
export type ApprovalState = "waiting" | "approved" | "done" | "declined" | "expired";

export function approvalState(row: ApprovalRow, now: Date): ApprovalState {
  if (row.used_at) return "done";
  if (row.declined_at) return "declined";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  if (row.approved_at) return "approved";
  return "waiting";
}

/** What the request would do: the operation's own words from the registry. */
export function approvalAsk(row: ApprovalRow): string {
  const op = OPERATIONS[row.operation as OperationName] as { about: string } | undefined;
  return op ? op.about : row.operation.replace(/_/g, " ");
}

/** The details it was asked with, as label and value lines, leaving out ids nobody reads. */
export function approvalDetails(row: ApprovalRow): { label: string; value: string }[] {
  return Object.entries(row.input)
    .filter(([key, value]) => !/Id$/.test(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
}

/** Supabase's OAuth server sends a connected app's sign-in here, with its authorization_id. */
export const CONSENT_PATH = "/oauth/consent";
export const CONSENT_PATH_WITH_ID = /^\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]+$/;
export const consentPath = (authorizationId: string) => `${CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`;
