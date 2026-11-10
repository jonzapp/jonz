
// Deleting an account (supabase/migrations/*_delete_account.sql): its
// words, the day it goes, and the typed word that confirms it. Asked for in
// the app (House, Leave) or at jonz.app/delete, which Google Play asks for:
// a page anyone who has removed the app can use.

/** The page anyone can open to delete their account, signed in or not. */
export const DELETE_PATH = "/delete";

/** How long an account waits before it goes, in which signing in can keep it. */
export const DELETION_DAYS = 30;

/** What you type to confirm, so it can't happen with one tap. */
export const DELETE_WORD = "DELETE";

/** Whether what's typed confirms it: the word, in any case, spaces around it ignored. */
export function confirmsDelete(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_WORD;
}

/** A day as the being-deleted screen says it: "Sun 29 Nov". */
export function deletionDay(iso: string, zone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zone }).format(
    new Date(iso),
  );
}

/**
 * The day an account went, as its last email says it: "31 October 2026",
 * where they were. A zone that isn't one (or none) reads as UTC.
 */
export function deletedOnDay(at: Date, zone?: string | null): string {
  const day = (timeZone: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone }).format(at);
  try {
    return day(zone || "UTC");
  } catch {
    return day("UTC");
  }
}

/** A date as the sheet says how long a Pass lasts: "12 Oct 2027". */
export function passDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** What the database says before you ask: your house, and until when a Pass you pay for covers it. */
export interface DeletionPreview {
  house: string | null;
  /** YYYY-MM-DD, in the house's zone; null when you don't pay for one that renews. */
  passUntil: string | null;
  deleteAfter: string;
}

export function previewFromRow(row: unknown): DeletionPreview {
  const value = (row ?? {}) as { house?: unknown; pass_until?: unknown; delete_after?: unknown };
  return {
    house: typeof value.house === "string" ? value.house : null,
    passUntil: typeof value.pass_until === "string" ? value.pass_until : null,
    deleteAfter: typeof value.delete_after === "string" ? value.delete_after : new Date(Date.now() + DELETION_DAYS * 86_400_000).toISOString(),
  };
}

/** Yours while it waits; null when your account isn't being deleted. */
export interface DeletionStatus {
  deleteAfter: string;
  requestedBy: "self" | "owner";
}

export function statusFromRow(row: unknown): DeletionStatus | null {
  const value = row as { delete_after?: unknown; requested_by?: unknown } | null;
  if (!value || typeof value.delete_after !== "string") return null;
  return { deleteAfter: value.delete_after, requestedBy: value.requested_by === "owner" ? "owner" : "self" };
}
