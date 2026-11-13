import "server-only";

import { ASK_ACCOUNT_DAYS, ASK_POOL_TOKENS, askUsage, type AccountUse, hasPass, passOf, rulesOf, weekWindow, type AskUsage, type Database } from "@app/core";

import { createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";
import { myPermissions } from "./permitted";

type HouseRow = Database["public"]["Tables"]["houses"]["Row"];

/**
 * The house's Ask Jonz week: when it started and ends (the house's own
 * week, so it comes back when the house's week starts) and how big its pool
 * is (bigger with the House Pass).
 */
export function askWeek(house: HouseRow, now: Date) {
  const rules = rulesOf(house);
  const week = weekWindow(now, rules.timezone, rules.weekStarts);
  const pass = hasPass(passOf(house), now);
  return { week, pass, pool: pass ? ASK_POOL_TOKENS.pass : ASK_POOL_TOKENS.free };
}

/** The start of the account's rolling window: ASK_ACCOUNT_DAYS ago. */
export function accountSince(now: Date): Date {
  return new Date(now.getTime() - ASK_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);
}

/** What a person has used of Ask Jonz in any house over the account's window, and when its oldest turn drops off. */
async function accountUse(userId: string, now: Date): Promise<AccountUse> {
  const { data, error } = await createAdminClient().rpc("ask_account_used", { p_user: userId, p_since: accountSince(now).toISOString() });
  if (error) throw new Error(`Couldn't read the account's Ask Jonz: ${error.message}`);
  const row = data?.[0];
  const oldest = row?.oldest ? new Date(row.oldest) : null;
  return {
    used: Number(row?.used ?? 0),
    backAt: oldest ? new Date(oldest.getTime() + ASK_ACCOUNT_DAYS * 24 * 60 * 60 * 1000) : null,
  };
}

/** What the house and each person in it have used of this week's pool, as the usage page and the chat show it. */
export async function usageNow(house: HouseRow, people: readonly string[], me: string, now: Date): Promise<AskUsage> {
  const { week, pass, pool } = askWeek(house, now);
  const [{ data, error }, account] = await Promise.all([
    createAdminClient().rpc("ask_usage_people", { p_house: house.id, p_since: week.startsAt.toISOString() }),
    accountUse(me, now),
  ]);
  if (error) throw new Error(`Couldn't read the week's Ask Jonz: ${error.message}`);
  const used = new Map((data ?? []).map((row) => [row.user_id, Number(row.used)]));
  return askUsage({ pool, pass, people, me, used, resetsAt: week.endsAt, account });
}

/**
 * GET /api/ask/usage: the week's Ask Jonz for anyone in the house, read as
 * them (row rules decide the house and who lives there).
 */
export async function houseUsage(caller: Caller, houseId: string, now: Date): Promise<{ refusal: Refusal } | AskUsage> {
  const allowed = await myPermissions(caller, houseId);
  if (allowed.length === 0) return { refusal: { code: "42501", message: "not_in_house" } };
  const [{ data: house }, { data: members }] = await Promise.all([
    caller.db.from("houses").select("*").eq("id", houseId).single(),
    caller.db.from("members").select("user_id").eq("house_id", houseId).order("joined_at"),
  ]);
  if (!house) return { refusal: { code: "42501", message: "not_in_house" } };
  return usageNow(house, (members ?? []).map((m) => m.user_id), caller.userId, now);
}
