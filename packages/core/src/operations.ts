import type { OwnerPermission } from "./owner-moves";
import type { PassFeature } from "./pass";
import type { AccountPermission, Permission } from "./permissions";

// The operation registry (docs/specs/operation-registry.md): every operation
// a person can perform on Jonz, from the app, the API, Ask Jonz or (later)
// MCP, in one list. Each entry says what it reads or changes, which check
// guards it, whether it can't be undone, and which House Pass feature it
// needs. Tests hold the list to the truth:
//
// - the database's callable functions are exactly the `rpc` entries here
//   (apps/api/tests/db/operations.test.ts);
// - every API route is an operation's `route` or a SYSTEM_ROUTES entry
//   (apps/api/tests/unit/operations.test.ts);
// - every guarded operation refuses a signed-in stranger, and every app
//   operation refuses a housemate, called against a real house.
//
// The database is still the one place that says yes or no: this list says
// what it should say, so a gap shows up as a failing test.

/**
 * What guards an operation or a table.
 *
 * - `permission`: a named permission. A house one is asked with
 *   can(house, …), an admin page one with can_app(…), and an account one
 *   (`account:…`) is anyone signed in, about their own rows.
 * - `check`: a yes/no helper that answers about the caller and changes
 *   nothing (can, is_member…).
 * - `member` and `own` (tables only, until their reads are split by
 *   resource): anyone in the house, or the caller's own rows.
 */
export type Guard =
  | { by: "permission"; permission: Permission | OwnerPermission | AccountPermission }
  | { by: "check" }
  | { by: "member" }
  | { by: "own" };

/** An operation always names its permission, unless it's a check. */
export type OperationGuard = Exclude<Guard, { by: "member" } | { by: "own" }>;

/** Which part of Jonz an operation acts in. */
export const OPERATION_SCOPES = ["house", "app", "account"] as const;
export type OperationScope = (typeof OPERATION_SCOPES)[number];

export interface Operation {
  /** One sentence on what it does, in plain words (tool descriptions use it). */
  about: string;
  scope: OperationScope;
  /** Whether it changes anything. */
  effect: "read" | "write";
  /**
   * The least it takes. An operation on other people's rows as well as
   * your own (removing a flag, leaving or removing someone) asks the
   * higher permission, inside, for theirs.
   */
  guard: OperationGuard;
  /**
   * The database function it runs. `server` ones are callable only by the
   * API's service role, after the route has checked the guard.
   */
  rpc?: { name: string; server?: true };
  /** The API route in front of it, as "METHOD /api/path". */
  route?: string;
  /**
   * The tables it reads or changes straight, as the caller, under each
   * table's own rules (TABLES): an operation the app does today with the
   * tables themselves. One with an `rpc` too is served by that function on
   * /v1 while the app still reads the tables, until it moves (C2).
   */
  tables?: readonly TableName[];
  /** A read of everything one screen shows at once, in place of several: one round trip. */
  screen?: true;
  /**
   * It can't be taken back, or it reaches people outside the caller's
   * screen (a push, an email, a public notice). An MCP client must get
   * the person's approval in Jonz before it runs.
   */
  destructive?: true;
  /** The House Pass feature it needs once the Pass is enforced (`PASS_ENFORCED`). */
  entitlement?: PassFeature;
  /**
   * The input key that turns the feature on: the Pass is needed only when
   * it's given (a tick is free; a tick with a photo needs `photos`). Absent,
   * the operation always needs it.
   */
  entitlementWhen?: string;
  /**
   * Only for the person in Jonz itself, never a connected app: approving a
   * connected app's request. Not offered over MCP, and the database refuses
   * an OAuth client's token for it.
   */
  firstParty?: true;
}

const op = <T extends Operation>(o: T) => o;
const perm = (permission: Permission | OwnerPermission | AccountPermission) => ({ by: "permission", permission }) as const;
const CHECK = { by: "check" } as const;
const ACCOUNT_READ = perm("account:read");
const ACCOUNT_WRITE = perm("account:write_own");
const MEMBER: Guard = { by: "member" };
const OWN: Guard = { by: "own" };

export const OPERATIONS = {
  // --- Checks: answer about the caller, change nothing ---------------------------------------
  can: op({ about: "Whether the caller holds a house permission", scope: "house", effect: "read", guard: CHECK, rpc: { name: "can" } }),
  my_permissions: op({ about: "Every house permission the caller holds in a house", scope: "house", effect: "read", guard: CHECK, rpc: { name: "my_permissions" } }),
  is_member: op({ about: "Whether the caller is in a house", scope: "house", effect: "read", guard: CHECK, rpc: { name: "is_member" } }),
  shares_house: op({ about: "Whether the caller shares a house with someone", scope: "house", effect: "read", guard: CHECK, rpc: { name: "shares_house" } }),
  runs_for: op({ about: "Whether the caller acts for a child without a sign-in", scope: "house", effect: "read", guard: CHECK, rpc: { name: "runs_for" } }),
  can_upload_proof: op({ about: "Whether the caller may upload a photo to this place", scope: "house", effect: "read", guard: CHECK, rpc: { name: "can_upload_proof" } }),
  can_app: op({ about: "Whether the caller holds an admin page permission", scope: "app", effect: "read", guard: CHECK, rpc: { name: "can_app" } }),
  is_owner: op({ about: "Whether the caller may see the admin pages", scope: "app", effect: "read", guard: CHECK, rpc: { name: "is_owner" } }),
  my_app_role: op({ about: "The caller's role on the admin pages", scope: "app", effect: "read", guard: CHECK, rpc: { name: "my_app_role" } }),
  my_app_permissions: op({ about: "Every admin page permission the caller holds", scope: "app", effect: "read", guard: CHECK, rpc: { name: "my_app_permissions" } }),
  owner_status: op({ about: "Whether to show the admin pages, ask for the code, and what the caller may do there", scope: "app", effect: "read", guard: CHECK, rpc: { name: "owner_status" } }),

  // --- Your account ---------------------------------------------------------------------------
  create_house: op({ about: "Start a new house", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "create_house" } }),
  start_house_from: op({ about: "Start a new house from one you're moving on from", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "start_house_from" } }),
  house_by_code: op({ about: "Look up a house by its join code", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "house_by_code" } }),
  join_house: op({ about: "Join a house with its code", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "join_house" } }),
  set_my_photo: op({ about: "Change your photo", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "set_my_photo" } }),
  set_away: op({ about: "Book time away", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "set_away" }, route: "POST /api/away" }),
  cancel_away: op({ about: "Cancel your time away", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "cancel_away" } }),
  set_moving_out: op({ about: "Say the day you're moving out", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "set_moving_out" } }),
  moving_on: op({ about: "Where you're moving on from, and what comes with you", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "moving_on" } }),
  leave_pass: op({ about: "Stop paying for a House Pass you bought for a house you've left", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "leave_pass" }, destructive: true }),
  account_deletion_preview: op({ about: "What deleting your account would remove", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "account_deletion_preview" } }),
  account_deletion_status: op({ about: "Whether your account is being deleted, and when", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "account_deletion_status" } }),
  request_account_deletion: op({ about: "Start deleting your account", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "request_account_deletion" }, destructive: true }),
  keep_account: op({ about: "Stop your account being deleted", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "keep_account" } }),
  my_reports: op({ about: "The problems you've reported, and their replies", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "my_reports" } }),
  send_report: op({ about: "Report a problem", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "send_report" }, route: "POST /api/reports" }),
  write_back: op({ about: "Write back on a problem you reported", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "write_back" }, route: "POST /api/reports/[id]/messages" }),
  see_report: op({ about: "Mark a reply to your report as seen", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "see_report" } }),
  api_approval: op({ about: "A connected app's request to do something that can't be undone, for you to approve", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "api_approval" }, firstParty: true }),
  answer_api_approval: op({ about: "Approve or decline a connected app's request", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "answer_api_approval" }, firstParty: true }),
  my_report: op({ about: "One of the problems you've reported, with its replies", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "my_report" }, tables: ["reports", "report_messages"] }),
  my_house: op({ about: "The house you're in, if any", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "my_house" }, tables: ["members", "houses"] }),
  set_my_name: op({ about: "Change the name you go by", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "set_my_name" }, tables: ["profiles"] }),
  my_notifications: op({ about: "Which notifications you get, and your quiet hours", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "my_notifications" }, tables: ["notification_prefs"] }),
  save_notifications: op({ about: "Change which notifications you get, and your quiet hours", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "save_notifications" }, tables: ["notification_prefs"] }),
  add_push_device: op({ about: "Get pushes on this device", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "add_push_device" }, tables: ["push_subscriptions"] }),
  remove_push_device: op({ about: "Stop pushes on this device", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "remove_push_device" }, tables: ["push_subscriptions"] }),
  my_ask_chats: op({ about: "Your saved Ask Jonz chats in a house, the latest first", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "my_ask_chats" }, tables: ["ask_chats"] }),
  my_ask_chat: op({ about: "One of your saved Ask Jonz chats, with its turns", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "my_ask_chat" }, tables: ["ask_chats"] }),
  keep_ask_chat: op({ about: "Save a new Ask Jonz chat", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "keep_ask_chat" }, tables: ["ask_chats"] }),
  update_ask_chat: op({ about: "Save an Ask Jonz chat as it now stands", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "update_ask_chat" }, tables: ["ask_chats"] }),
  delete_ask_chat: op({ about: "Delete one of your saved Ask Jonz chats", scope: "account", effect: "write", guard: ACCOUNT_WRITE, rpc: { name: "delete_ask_chat" }, tables: ["ask_chats"], destructive: true }),
  live_notices: op({ about: "The notices showing now, at the top of the app", scope: "account", effect: "read", guard: ACCOUNT_READ, rpc: { name: "live_notices" }, tables: ["notices"] }),

  // --- A house: reading -----------------------------------------------------------------------
  house_history: op({ about: "The house's history, a page at a time", scope: "house", effect: "read", guard: perm("history:read"), rpc: { name: "house_history" }, entitlement: "history" }),
  ask_usage: op({ about: "How much of the house's Ask Jonz this month each person has used", scope: "house", effect: "read", guard: perm("house:read"), rpc: { name: "ask_usage_people", server: true }, route: "POST /api/ask/usage" }),
  catch_up: op({ about: "Bring the house up to date: close a finished week, deal the next", scope: "house", effect: "write", guard: perm("house:read"), route: "POST /api/fresh" }),
  house_today: op({
    about: "Everything Today and the Week show at once: the house and its rules, its people, this week's Johns, open questions, who's on call and open swap asks",
    scope: "house",
    effect: "read",
    guard: perm("house:read"),
    rpc: { name: "house_today" },
    tables: ["houses", "members", "profiles", "weeks", "assignments", "johns", "crew_members", "disputes", "dispute_votes", "on_call_picks", "swap_offers", "events"],
    screen: true,
  }),
  john_list: op({ about: "The house's John list, oldest first, and its groups", scope: "house", effect: "read", guard: perm("johns:read"), rpc: { name: "john_list" }, tables: ["johns", "groups", "group_members"] }),
  house_wall: op({ about: "The Wall, newest first, a page at a time, with reactions", scope: "house", effect: "read", guard: perm("wall:read"), rpc: { name: "house_wall" }, tables: ["events", "assignments", "reactions"] }),
  house_away: op({ about: "The house's time away from a day on", scope: "house", effect: "read", guard: perm("away:read"), rpc: { name: "house_away" }, tables: ["away_periods"] }),
  house_month: op({ about: "This month's Johns and the recent weeks' shares: the Table's standings", scope: "house", effect: "read", guard: perm("weeks:read"), rpc: { name: "house_month" }, tables: ["assignments", "crew_members", "weeks", "week_shares"], screen: true }),
  house_balances: op({ about: "Each person's points owed and done over every week before one", scope: "house", effect: "read", guard: perm("weeks:read"), rpc: { name: "house_balances" } }),
  house_record: op({ about: "Every week's Johns, shares and time away: the Track record", scope: "house", effect: "read", guard: perm("weeks:read"), rpc: { name: "house_record" }, tables: ["weeks", "away_periods", "week_shares", "assignments", "crew_members"], screen: true }),
  house_stake: op({ about: "The house's money: every forfeit, payment and closed month", scope: "house", effect: "read", guard: perm("payments:read"), rpc: { name: "house_stake" }, tables: ["ledger_entries", "assignments", "month_closes"], screen: true }),
  house_pocket: op({ about: "Pocket money earned and paid", scope: "house", effect: "read", guard: perm("pocket_money:read"), rpc: { name: "house_pocket" }, tables: ["pocket_earnings", "pocket_pays"] }),

  // --- A house: your own Johns ----------------------------------------------------------------
  mark_done: op({ about: "Tick off a John", scope: "house", effect: "write", guard: perm("ticks:write_own"), rpc: { name: "mark_done" }, entitlement: "photos", entitlementWhen: "photoPath" }),
  undo_done: op({ about: "Take back a tick", scope: "house", effect: "write", guard: perm("ticks:write_own"), rpc: { name: "undo_done" } }),
  plan_john: op({ about: "Say when you'll do a John", scope: "house", effect: "write", guard: perm("ticks:write_own"), rpc: { name: "plan_john" } }),
  roll_call: op({ about: "Tick off a shared John, with who helped", scope: "house", effect: "write", guard: perm("ticks:write_own"), rpc: { name: "roll_call" }, route: "POST /api/roll-call", entitlement: "photos", entitlementWhen: "photoPath" }),
  save_prefs: op({ about: "Change which days and times suit you, and Johns you'd rather", scope: "house", effect: "write", guard: perm("profile:write_own"), rpc: { name: "save_prefs" } }),
  use_immunity: op({ about: "Use an immunity on a John", scope: "house", effect: "write", guard: perm("perks:write_own"), rpc: { name: "use_immunity" } }),
  use_swap: op({ about: "Use a swap token to swap a John", scope: "house", effect: "write", guard: perm("perks:write_own"), rpc: { name: "use_swap" } }),
  offer_swap: op({ about: "Ask someone to swap a John with you", scope: "house", effect: "write", guard: perm("swaps:write_own"), rpc: { name: "offer_swap" }, route: "POST /api/swaps" }),
  answer_swap: op({ about: "Say yes or no to a swap ask", scope: "house", effect: "write", guard: perm("swaps:write_own"), rpc: { name: "answer_swap" } }),
  answer_dispute: op({ about: "Answer a question about your tick, with a photo", scope: "house", effect: "write", guard: perm("disputes:write_own"), rpc: { name: "answer_dispute" }, entitlement: "photos", entitlementWhen: "photoPath" }),
  undo_action: op({ about: "Undo a move from History", scope: "house", effect: "write", guard: perm("history:write_own"), rpc: { name: "undo_action" } }),
  undo_latest: op({ about: "Undo your latest move of a kind", scope: "house", effect: "write", guard: perm("history:write_own"), rpc: { name: "undo_latest" } }),

  // --- A house: anyone in it ------------------------------------------------------------------
  cover_john: op({ about: "Do someone else's overdue John", scope: "house", effect: "write", guard: perm("swaps:write_own"), rpc: { name: "cover_john" }, entitlement: "photos", entitlementWhen: "photoPath" }),
  hold_cover: op({ about: "Say you're on someone else's overdue John", scope: "house", effect: "write", guard: perm("swaps:write_own"), rpc: { name: "hold_cover" } }),
  undo_cover: op({ about: "Take back a cover", scope: "house", effect: "write", guard: perm("swaps:write_own"), rpc: { name: "undo_cover" } }),
  raise_flag: op({ about: "Flag an on-call John that needs doing", scope: "house", effect: "write", guard: perm("flags:write_own"), rpc: { name: "raise_flag" }, route: "POST /api/flags" }),
  raise_dispute: op({ about: "Question a tick", scope: "house", effect: "write", guard: perm("disputes:write_own"), rpc: { name: "raise_dispute" }, route: "POST /api/disputes" }),
  cast_vote: op({ about: "Vote on a questioned tick", scope: "house", effect: "write", guard: perm("disputes:write_own"), rpc: { name: "cast_vote" }, route: "POST /api/disputes/[id]/votes" }),
  confirm_payment: op({ about: "Mark money paid between housemates", scope: "house", effect: "write", guard: perm("payments:write_own"), rpc: { name: "confirm_payment" }, destructive: true, entitlement: "stake" }),
  ask_house: op({ about: "Ask Jonz about the house, or ask it to change something", scope: "house", effect: "write", guard: perm("house:read"), route: "POST /api/setup/draft" }),
  pass_checkout: op({ about: "Buy the House Pass", scope: "house", effect: "write", guard: perm("billing:write_own"), route: "POST /api/pass/checkout" }),
  pass_billing: op({ about: "Open billing for a House Pass you bought", scope: "house", effect: "read", guard: perm("billing:write_own"), route: "POST /api/pass/manage" }),

  react: op({ about: "React to something on the Wall", scope: "house", effect: "write", guard: perm("wall:write_own"), rpc: { name: "react" }, tables: ["reactions"] }),
  unreact: op({ about: "Take back your reaction", scope: "house", effect: "write", guard: perm("wall:write_own"), rpc: { name: "unreact" }, tables: ["reactions"] }),

  // --- A house: admins (Parents) --------------------------------------------------------------
  add_john: op({ about: "Add a John to the list", scope: "house", effect: "write", guard: perm("johns:write"), rpc: { name: "add_john" }, tables: ["johns"] }),
  add_johns: op({ about: "Add several Johns at once, all or none", scope: "house", effect: "write", guard: perm("johns:write"), rpc: { name: "add_johns" }, tables: ["johns"] }),
  change_john: op({ about: "Change a John on the list, from the next deal", scope: "house", effect: "write", guard: perm("johns:write"), rpc: { name: "change_john" }, tables: ["johns"] }),
  remove_john: op({ about: "Take a John off the list; weeks already dealt keep it", scope: "house", effect: "write", guard: perm("johns:write"), rpc: { name: "remove_john" }, tables: ["johns"] }),
  save_house_rules: op({ about: "Change the house's name and rules", scope: "house", effect: "write", guard: perm("house:write"), rpc: { name: "save_house_rules" }, tables: ["houses"] }),
  set_deal_mode: op({ about: "Choose how the house shares its Johns: Smart or Classic", scope: "house", effect: "write", guard: perm("house:write"), rpc: { name: "set_deal_mode" }, tables: ["houses"] }),
  answer_tick: op({ about: "OK a kid's tick, or send it back", scope: "house", effect: "write", guard: perm("ticks:write"), rpc: { name: "answer_tick" }, route: "POST /api/oks/[id]" }),
  board_tick: op({ about: "Tick a kid's John from the kitchen board", scope: "house", effect: "write", guard: perm("ticks:write"), rpc: { name: "board_tick" } }),
  remove_flag: op({ about: "Remove a flag: your own, or anyone's with flags:write", scope: "house", effect: "write", guard: perm("flags:write_own"), rpc: { name: "remove_flag" } }),
  save_group: op({ about: "Make or change a group", scope: "house", effect: "write", guard: perm("groups:write"), rpc: { name: "save_group" } }),
  delete_group: op({ about: "Delete a group", scope: "house", effect: "write", guard: perm("groups:write"), rpc: { name: "delete_group" }, destructive: true }),
  reset_join_code: op({ about: "Make a new join code (the old one stops working)", scope: "house", effect: "write", guard: perm("house:write"), rpc: { name: "reset_join_code" }, destructive: true }),
  set_house_kind: op({ about: "Switch the house between housemates and family", scope: "house", effect: "write", guard: perm("house:write"), rpc: { name: "set_house_kind" }, destructive: true }),
  deal_week: op({ about: "Deal the week", scope: "house", effect: "write", guard: perm("weeks:write"), rpc: { name: "deal_week", server: true }, route: "POST /api/deal" }),
  reset_house: op({ about: "Put a result, a week or a month's forfeits right", scope: "house", effect: "write", guard: perm("history:write"), rpc: { name: "admin_reset", server: true }, route: "POST /api/resets", destructive: true }),
  pay_pocket_money: op({ about: "Mark a kid's pocket money paid", scope: "house", effect: "write", guard: perm("pocket_money:write"), rpc: { name: "pay_pocket_money" }, destructive: true }),
  add_kid: op({ about: "Add a child without a sign-in", scope: "house", effect: "write", guard: perm("members:write"), rpc: { name: "add_kid", server: true }, route: "POST /api/kids" }),
  remove_member: op({ about: "Leave the house, or remove someone from it with members:write", scope: "house", effect: "write", guard: perm("members:write_own"), rpc: { name: "remove_member" }, destructive: true }),
  set_member_role: op({ about: "Make someone an admin, or not", scope: "house", effect: "write", guard: perm("members:write"), rpc: { name: "set_member_role" }, destructive: true }),
  hand_over: op({ about: "Hand admin over to someone else", scope: "house", effect: "write", guard: perm("members:write"), rpc: { name: "hand_over" }, destructive: true }),

  // --- The admin pages ------------------------------------------------------------------------
  owner_overview: op({ about: "The Overview: sign-ups, houses, money and reports", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_overview" } }),
  owner_houses_find: op({ about: "Find houses", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_houses_find" } }),
  owner_houses_page: op({ about: "Houses, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_houses_page" } }),
  owner_houses_count: op({ about: "How many houses match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_houses_count" } }),
  owner_house: op({ about: "One house in full", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_house" } }),
  owner_people_find: op({ about: "Find people", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_people_find" } }),
  owner_reports_page: op({ about: "The Inbox, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_reports_page" } }),
  owner_reports_count: op({ about: "How many reports match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_reports_count" } }),
  owner_same_as_find: op({ about: "Find reports that say the same thing", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_same_as_find" } }),
  owner_messages_find: op({ about: "Find sent messages", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_messages_find" } }),
  owner_messages_page: op({ about: "Sent messages, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_messages_page" } }),
  owner_messages_count: op({ about: "How many sent messages match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_messages_count" } }),
  owner_message_reach: op({ about: "How many people a message would reach", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_message_reach" } }),
  owner_promotion: op({ about: "One promotion in full", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_promotion" } }),
  owner_promotions_find: op({ about: "Find promotions", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_promotions_find" } }),
  owner_promotions_page: op({ about: "Promotions, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_promotions_page" } }),
  owner_promotions_count: op({ about: "How many promotions match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_promotions_count" } }),
  owner_deletions: op({ about: "Accounts being deleted", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_deletions" } }),
  owner_deletions_page: op({ about: "Deletions, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_deletions_page" } }),
  owner_deletions_count: op({ about: "How many deletions match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_deletions_count" } }),
  claim_owner_ask: op({ about: "Start a turn of the owner's Ask Jonz", scope: "app", effect: "write", guard: perm("admin:read"), rpc: { name: "claim_owner_ask" } }),
  finish_owner_ask: op({ about: "Finish a turn of the owner's Ask Jonz", scope: "app", effect: "write", guard: perm("admin:read"), rpc: { name: "finish_owner_ask" } }),
  ask_owner: op({ about: "Ask Jonz on the admin pages, or ask it to do something", scope: "app", effect: "write", guard: perm("admin:read"), route: "POST /api/admin/ask" }),
  owner_reply_report: op({ about: "Reply to a report (its sender gets a push and an email)", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "owner_reply_report" }, route: "POST /api/reports/[id]/reply", destructive: true }),
  owner_fix_report: op({ about: "Mark a report fixed, and tell everyone who sent it", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "owner_fix_report" }, route: "POST /api/reports/[id]/fixed", destructive: true }),
  owner_open_report: op({ about: "Read a report in full, marking a new one open", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "owner_open_report" } }),
  owner_set_report_state: op({ about: "Change a report's state", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "owner_set_report_state" } }),
  owner_same_as: op({ about: "Fold a report into one that says the same thing", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "owner_same_as" } }),
  claim_support_draft: op({ about: "Start the support agent's draft reply to a report", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "claim_support_draft" }, route: "POST /api/reports/[id]/draft" }),
  finish_support_draft: op({ about: "Save the support agent's draft reply", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "finish_support_draft" } }),
  owner_set_support_draft: op({ about: "Use or set aside a draft reply", scope: "app", effect: "write", guard: perm("reports:write"), rpc: { name: "owner_set_support_draft" } }),
  save_notice: op({ about: "Put up a notice, or change one", scope: "app", effect: "write", guard: perm("notices:write"), rpc: { name: "save_notice" }, destructive: true }),
  end_notice: op({ about: "End a notice", scope: "app", effect: "write", guard: perm("notices:write"), rpc: { name: "end_notice" } }),
  write_notice_copy: op({ about: "Publish the notices to the fast copy the app reads first", scope: "app", effect: "write", guard: perm("notices:write"), route: "POST /api/notices/copy" }),
  owner_send_message: op({ about: "Send a message to a person, a house or everyone", scope: "app", effect: "write", guard: perm("messages:write"), rpc: { name: "owner_send_message" }, route: "POST /api/admin/messages", destructive: true }),
  owner_make_promotion: op({ about: "Make a promotion, with its Stripe coupon", scope: "app", effect: "write", guard: perm("promotions:write"), rpc: { name: "owner_make_promotion" }, route: "POST /api/admin/promotions", destructive: true }),
  retry_promotion: op({ about: "Try a promotion's Stripe set-up again", scope: "app", effect: "write", guard: perm("promotions:write"), route: "POST /api/admin/promotions/[id]/retry" }),
  owner_stop_promotion: op({ about: "Stop a promotion", scope: "app", effect: "write", guard: perm("promotions:write"), rpc: { name: "owner_stop_promotion" }, route: "POST /api/admin/promotions/[id]/stop", destructive: true }),
  owner_promotion_emails: op({ about: "Email the people a promotion names", scope: "app", effect: "write", guard: perm("promotions:write"), rpc: { name: "owner_promotion_emails" }, route: "POST /api/admin/promotions/[id]/email", destructive: true }),
  owner_delete_now: op({ about: "Delete an account now", scope: "app", effect: "write", guard: perm("deletions:write"), rpc: { name: "owner_delete_now" }, destructive: true }),
  owner_request_deletion: op({ about: "Start deleting an account for someone who asked by email", scope: "app", effect: "write", guard: perm("deletions:write"), rpc: { name: "owner_request_deletion" }, destructive: true }),
  owner_stop_deletion: op({ about: "Stop an account being deleted", scope: "app", effect: "write", guard: perm("deletions:write"), rpc: { name: "owner_stop_deletion" } }),
  owner_delete_house: op({ about: "Delete a whole house, telling its people why", scope: "app", effect: "write", guard: perm("houses:write"), rpc: { name: "owner_delete_house" }, route: "POST /api/admin/houses/[id]/delete", destructive: true }),
  owner_notices_page: op({ about: "Every notice, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_notices_page" }, tables: ["notices"] }),
  owner_notices_count: op({ about: "How many notices match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_notices_count" }, tables: ["notices"] }),
  owner_audit_page: op({ about: "The audit log, a page at a time", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_audit_page" }, tables: ["admin_audit"] }),
  owner_audit_count: op({ about: "About how many audit log entries match", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_audit_count" }, tables: ["admin_audit"] }),
  owner_audit_entry: op({ about: "One audit log entry in full, with what it changed", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_audit_entry" }, tables: ["admin_audit"] }),
  owner_ask_chats: op({ about: "The owner's saved Ask Jonz chats, the latest first", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_ask_chats" }, tables: ["owner_ask_chats"] }),
  owner_ask_chat: op({ about: "One of the owner's saved Ask Jonz chats, with its turns", scope: "app", effect: "read", guard: perm("admin:read"), rpc: { name: "owner_ask_chat" }, tables: ["owner_ask_chats"] }),
  keep_owner_ask_chat: op({ about: "Save a new owner Ask Jonz chat", scope: "app", effect: "write", guard: perm("admin:read"), rpc: { name: "keep_owner_ask_chat" }, tables: ["owner_ask_chats"] }),
  update_owner_ask_chat: op({ about: "Save an owner Ask Jonz chat as it now stands", scope: "app", effect: "write", guard: perm("admin:read"), rpc: { name: "update_owner_ask_chat" }, tables: ["owner_ask_chats"] }),
  delete_owner_ask_chat: op({ about: "Delete one of the owner's saved Ask Jonz chats", scope: "app", effect: "write", guard: perm("admin:read"), rpc: { name: "delete_owner_ask_chat" }, tables: ["owner_ask_chats"], destructive: true }),
} as const satisfies Record<string, Operation>;

export type OperationName = keyof typeof OPERATIONS;
export const OPERATION_NAMES = Object.keys(OPERATIONS) as OperationName[];

/** Every operation the database runs for a signed-in person (not the service role). */
export const CALLABLE_FUNCTIONS: readonly string[] = OPERATION_NAMES.flatMap((n) => {
  const o: Operation = OPERATIONS[n];
  return o.rpc && !o.rpc.server ? [o.rpc.name] : [];
});

/**
 * API routes that aren't one person's operation: each says what calls it
 * and how it proves who it is.
 */
export const SYSTEM_ROUTES = {
  "GET /api/[...path]": "Unknown API paths: a JSON 404",
  "POST /api/[...path]": "Unknown API paths: a JSON 404",
  "PUT /api/[...path]": "Unknown API paths: a JSON 404",
  "PATCH /api/[...path]": "Unknown API paths: a JSON 404",
  "DELETE /api/[...path]": "Unknown API paths: a JSON 404",
  "GET /api/cron/tick": "Vercel Cron, with CRON_SECRET: closes weeks, deals, sends due pushes and emails",
  "POST /api/cron/tick": "Vercel Cron, with CRON_SECRET: closes weeks, deals, sends due pushes and emails",
  "POST /api/stripe/webhook": "Stripe, signed: House Pass payments",
  "POST /api/email/inbound": "Resend, signed (Svix): replies to report emails",
  "POST /api/push-actions": "A notification's button, with a one-use token in the push",
  "GET /api/notices": "Anyone: the notices that are on",
  "GET /api/offer/[code]": "Anyone: what a promotion link offers",
  "GET /api/share/[[...path]]": "Anyone: the link preview for an invite or an offer",
} as const;

/** A table signed-in people reach directly, and what they may do to it. */
export interface TableAccess {
  /** What it holds, in plain words. */
  about: string;
  /** The database operations granted to signed-in people (some only on chosen columns). */
  grants: readonly ("select" | "insert" | "update" | "delete")[];
  /** Who may read rows (the table's rules). */
  read: Guard;
  /** Who may change rows, when it can be changed directly. */
  write?: Guard;
  /** Readable signed out too. */
  public?: true;
}

const reads = (about: string, read: Guard): TableAccess => ({ about, grants: ["select"], read });

/**
 * Every table signed-in people can reach directly
 * (apps/api/tests/db/operations.test.ts checks the grants match). Changes
 * go through an operation above unless a table says `write`.
 */
export const TABLES = {
  houses: { about: "Houses: name, rules and settings", grants: ["select", "update"], read: perm("house:read"), write: perm("house:write") },
  johns: { about: "The John list", grants: ["select", "insert", "update"], read: perm("johns:read"), write: perm("johns:write") },
  profiles: { about: "People's names and photos", grants: ["select", "update"], read: MEMBER, write: OWN },
  notification_prefs: { about: "Each person's notification settings", grants: ["select", "insert", "update"], read: OWN, write: OWN },
  push_subscriptions: { about: "Each person's devices for pushes", grants: ["select", "insert", "delete"], read: OWN, write: OWN },
  reactions: { about: "Reactions on the Wall", grants: ["select", "insert", "delete"], read: perm("wall:read"), write: OWN },
  ask_chats: { about: "Saved Ask Jonz chats", grants: ["select", "insert", "update", "delete"], read: OWN, write: OWN },
  owner_ask_chats: { about: "The owner's saved Ask Jonz chats", grants: ["select", "insert", "update", "delete"], read: perm("admin:read"), write: perm("admin:read") },
  members: reads("Who is in each house, and their role", perm("members:read")),
  assignments: reads("Who has which John each week", perm("weeks:read")),
  away_periods: reads("Time away", perm("away:read")),
  crew_members: reads("Who helped with a shared John", perm("weeks:read")),
  disputes: reads("Questioned ticks", perm("disputes:read")),
  dispute_votes: reads("Votes on questioned ticks", perm("disputes:read")),
  events: reads("The Wall and the house's history", perm("wall:read")),
  groups: reads("Groups", perm("groups:read")),
  group_members: reads("Who is in each group", perm("groups:read")),
  house_actions: reads("Moves that can be undone", perm("history:read")),
  ledger_entries: reads("Money owed and paid", perm("payments:read")),
  month_closes: reads("Closed months", perm("payments:read")),
  month_let_offs: reads("Forfeits let off", perm("payments:read")),
  moves: reads("Your own moves between houses", OWN),
  on_call_picks: reads("Who is on call", perm("weeks:read")),
  pocket_earnings: reads("Pocket money earned", perm("pocket_money:read")),
  pocket_pays: reads("Pocket money paid", perm("pocket_money:read")),
  swap_offers: reads("Swap asks, seen by the two people in them", OWN),
  week_shares: reads("Each person's share of a week", perm("weeks:read")),
  weeks: reads("Weeks", perm("weeks:read")),
  reports: reads("Problems people reported", OWN),
  report_messages: reads("Replies on reported problems", OWN),
  notices: { ...reads("Notices that are on (and every notice, for the admin pages)", ACCOUNT_READ), public: true },
  permissions: reads("The permissions list", ACCOUNT_READ),
  role_permissions: reads("What each house role may do", ACCOUNT_READ),
  app_role_permissions: reads("What each admin page role may do", ACCOUNT_READ),
  admin_audit: reads("The audit log of admin page changes", perm("admin:read")),
  support_drafts: reads("The support agent's draft replies", perm("reports:write")),
  owner_ask_turns: reads("The owner's Ask Jonz turns", perm("admin:read")),
} as const satisfies Record<string, TableAccess>;

export type TableName = keyof typeof TABLES;


const sqlText = (v: string) => `'${v.replaceAll("'", "''")}'`;

/**
 * The registry as the database standards check reads it
 * (supabase/checks/registry.sql, which a test keeps equal to this: run
 * `npx vitest run -u` in packages/core after changing the registry).
 */
export function registrySql(): string {
  const callable = [...CALLABLE_FUNCTIONS].sort().map((n) => `(${sqlText(n)})`);
  const grants = (Object.keys(TABLES) as TableName[]).sort().flatMap((t) => {
    const access: TableAccess = TABLES[t];
    const signedIn = access.grants.map((g) => `(${sqlText(t)}, 'authenticated', ${sqlText(g)})`);
    return access.public ? [...signedIn, `(${sqlText(t)}, 'anon', 'select')`] : signedIn;
  });
  return [
    "-- Generated from packages/core/src/operations.ts (the operation registry). Don't edit:",
    "-- change the registry, then run `npx vitest run -u` in packages/core.",
    "",
    "-- Server functions signed-in people may call (rule 22).",
    "create temp table callable (name text primary key);",
    `insert into callable values\n  ${callable.join(",\n  ")};`,
    "",
    "-- What signed-in (and signed-out) people may do to each table directly.",
    "create temp table table_grants (tbl text, grantee text, privilege text, primary key (tbl, grantee, privilege));",
    `insert into table_grants values\n  ${grants.join(",\n  ")};`,
    "",
  ].join("\n");
}
