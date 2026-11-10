import { z } from "zod";

import { APP_NAME } from "./app";
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

/** The consent page: an app asking to use Jonz as you. */
export const CONSENT_COPY = {
  page: "Connect an app",
  heading: (app: string) => `Let ${app} use ${APP_NAME}?`,
  body: (app: string) =>
    `${app} will see your house and can do what you can do in it, as you. Anything that can’t be undone still waits for you to approve it here.`,
  website: (uri: string) => `From ${uri}.`,
  backTo: (uri: string) => `You’ll go back to ${uri}.`,
  allow: "Allow",
  deny: "Don’t allow",
  allowing: "Allowing…",
  denying: "Going back…",
  gone: "This sign-in link has expired",
  goneBody: "Go back to the app and connect again.",
  signInReason: "Sign in to connect an app to Jonz.",
  signedInAs: (email: string) => `Signed in as ${email}.`,
  goHome: `Go to ${APP_NAME}`,
} as const;

/** Connected apps, on You: what each can do and how to stop it. */
export const CONNECTED_APPS_COPY = {
  heading: "Connected apps",
  none: "No apps are connected",
  noneMeta: "An app you connect to Jonz over MCP shows here.",
  since: (date: string) => `Connected ${date}.`,
  disconnect: "Disconnect",
  disconnecting: "Disconnecting…",
  confirm: (app: string) => `Disconnect ${app}? It signs out at once and has to ask again to come back.`,
} as const;

export const APPROVE_COPY = {
  page: "Approve a request",
  heading: "Approve this?",
  body: `An app you connected to ${APP_NAME} asked to do this. It can’t be undone, so it waits for you.`,
  inHouse: (house: string) => `In ${house}.`,
  approve: "Approve",
  decline: "Decline",
  approving: "Approving…",
  declining: "Declining…",
  approved: "Approved",
  approvedBody: "Go back to the app. It carries on from here.",
  done: "Done",
  doneBody: "The app has already done this.",
  declined: "Declined",
  declinedBody: "Nothing was changed, and the app won’t do it.",
  expired: "This request has expired",
  expiredBody: "Nothing was changed. Ask the app again if you still want it.",
  unknown: "This link doesn’t open a request",
  unknownBody: "It may be someone else’s. Check you’re signed in with the right account.",
  signIn: "Sign in to approve",
  signInReason: "Sign in to approve a request from an app you connected.",
  signedInAs: (email: string) => `Signed in as ${email}.`,
  goHome: `Go to ${APP_NAME}`,
} as const;
