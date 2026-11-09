import { z } from "zod";

import { AUDIT_WHAT, AUDIT_WHO } from "./admin-list";
import { CHAT_SAVED_TURNS, SavedTurn } from "./ask-chats";
import { BEST_TIMES, CURRENCIES, DEAL_MODES, HOUSE_KINDS } from "./domain";
import { AskUsage, ChatRequest, ChatResponse } from "./house-draft";
import { AddKid, AddKidResponse } from "./kids";
import { Notice, NOTICE_KINDS } from "./notices";
import { NotificationPrefsDraft } from "./notify";
import type { OperationName } from "./operations";
import { OwnerAskRequest, OwnerAskResponse } from "./owner-ask";
import { MESSAGE_AUDIENCES, OwnerMessageRequest, OwnerMessageResponse } from "./owner-messages";
import { DeleteHouseRequest, DeleteHouseResponse } from "./owner-moves";
import { PASS_PLANS } from "./pass";
import { PROMOTION_AUDIENCES, PROMOTION_DURATIONS, PROMOTION_KINDS, PromotionEmailed, PromotionMade, PromotionRequest } from "./promotions";
import { REPORT_KINDS, REPORT_STATES, ReportFixRequest, ReportFixResponse, ReportMessageRequest, ReportMessageResponse, ReportRequest, ReportResponse } from "./reports";
import { ResetRequest, ResetResponse } from "./resets";
import {
  AnswerTick,
  AwayDraft,
  AwayResponse,
  CastVote,
  DealRequest,
  DisplayName,
  HouseSettings,
  JohnFields,
  johnMonthly,
  FlagResponse,
  FreshRequest,
  FreshResponse,
  MoveResponse,
  PassCheckoutRequest,
  PassManageRequest,
  PassRedirect,
  RaiseDispute,
  RaiseFlag,
  RollCallRequest,
  RollCallResponse,
  SwapAskRequest,
  SwapAskResponse,
} from "./schemas";
import { SupportDraftResponse } from "./support-draft";
import { TABLE_ROWS as T } from "./table-rows";
import { REACTIONS } from "./wall";

// What every operation in the registry (operations.ts) takes and gives, and
// where it lives in the versioned API: the contract /v1, MCP and Ask Jonz's
// tools are built from (docs/specs/operation-registry.md).
//
// - `input` is camelCase, ids named for what they are (houseId,
//   assignmentId). An operation that runs a database function passes it as
//   that function's arguments: `p_` and the name in snake_case, without its
//   `Id` (houseId is p_house), unless `args` says otherwise.
// - `output` is the answer when it works, camelCase all the way down
//   (`camelKeys` turns the database's rows into it). A refusal is an error,
//   not an output.
// - `http` is "METHOD /v1/path": reads are GET, writes POST, PATCH or
//   DELETE. A house's things live under /v1/houses/{houseId}/…, anything
//   with its own id at the top (/v1/assignments/{assignmentId}), what's
//   yours under /v1/me/…, and the admin pages under /v1/admin/….
// - `page` marks a list read a page at a time: it takes `limit` and
//   `startingAfter`, and answers `{ data, hasMore, startingAfter }`, the
//   last being what to pass for the page after (null on the last page).
//
// It's a Record over every operation, so a new one without its contract
// doesn't compile. Tests hold it to the database: each function's
// arguments by name, type and whether they can be left out, and real
// answers parsed with `output` (apps/api/tests/db/operation-io.test.ts).

export const HTTP_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type HttpRoute = `${HttpMethod} /v1/${string}`;

export interface OperationIo {
  input: z.ZodObject;
  output: z.ZodType;
  http: HttpRoute;
  /** Input keys whose function argument isn't the rule's (`p_` + snake_case, without `Id`). */
  args?: Readonly<Record<string, string>>;
  /**
   * For an operation behind an API route whose request names things
   * differently: the route's request from this input.
   */
  toRequest?: (input: never) => unknown;
  /** A list read a page at a time: which of a row's fields the cursor holds, and (for a function) which arguments take them. */
  page?: { at: string; id: string; atArg?: string; idArg?: string };
}

// --- Pieces ------------------------------------------------------------------------------------

const id = z.uuid();
const text = z.string();
const int = z.int();
const count = z.int().min(0);
const bool = z.boolean();
const at = z.iso.datetime({ offset: true });
const day = z.iso.date();
const month = z.string().regex(/^\d{4}-\d{2}$/);
const json = z.json();
/** A function that answers nothing. */
const nothing = z.null();
const none = z.object({});
const role = z.enum(["admin", "member"]);
const plan = z.enum(PASS_PLANS);

const io = <I extends z.ZodObject, O extends z.ZodType>(
  input: I,
  output: O,
  http: HttpRoute,
  more: Omit<OperationIo, "input" | "output" | "http"> = {},
): OperationIo & { input: I; output: O } => ({
  input,
  output,
  http,
  ...more,
});

/** Admin lists' filters as the search box sends them (admin-list.ts). */
const span = { after: at.nullable().optional(), before: at.nullable().optional() };
const q = z.string().max(200).optional();
const pageInput = { limit: z.int().min(1).max(100).optional(), startingAfter: z.string().max(200).optional() };
const pageOf = (atField: string, idField = "id", idArg = "p_cursor_id") => ({ at: atField, id: idField, atArg: "p_cursor_at", idArg });
/** A list read a page at a time: its rows, whether there are more, and what to pass as `startingAfter` for them. */
export const pageOutput = <T extends z.ZodType>(row: T) => z.object({ data: z.array(row), hasMore: bool, startingAfter: text.nullable() });

const sameAsReport = z.object({ id, words: text, state: text, name: text.nullable() });
const supportDraft = z.object({ id, state: text, reply: text, action: text, why: text, sameAs: sameAsReport.nullable() });
const report = z.object({
  id,
  userId: id.nullable(),
  name: text.nullable(),
  email: text.nullable(),
  houseId: id.nullable(),
  houseName: text.nullable(),
  role: role.nullable(),
  kind: z.enum(REPORT_KINDS),
  state: z.enum(REPORT_STATES),
  words: text,
  details: json.nullable(),
  shots: z.array(text),
  createdAt: at,
  updatedAt: at,
  source: text,
  subject: text.nullable(),
  sameAs: sameAsReport.nullable(),
  also: z.array(z.object({ id, words: text, state: text, createdAt: at, name: text.nullable() })),
  messages: z.array(z.object({ id, fromOwner: bool, authorName: text.nullable(), body: text, at })),
});
const promotionRow = z.object({
  id,
  madeAt: at,
  code: text,
  name: text,
  kind: z.enum(PROMOTION_KINDS),
  percentOff: int.nullable(),
  amountOff: json.nullable(),
  duration: z.enum(PROMOTION_DURATIONS).nullable(),
  months: int.nullable(),
  plans: z.array(text),
  audience: z.enum(PROMOTION_AUDIENCES),
  people: count,
  uses: count,
  maxUses: int.nullable(),
  endsAt: at.nullable(),
  state: text,
});
const promotion = promotionRow.omit({ people: true }).extend({
  note: text.nullable(),
  madeBy: id.nullable(),
  stoppedAt: at.nullable(),
  createdAt: at,
  people: z.array(z.object({ email: text, name: text.nullable(), openedAt: at.nullable(), emailedAt: at.nullable(), usedAt: at.nullable() })),
  recent: z.array(z.object({ house: text.nullable(), houseId: id.nullable(), plan: text, at })),
});
const messageRow = z.object({
  id,
  sentAt: at,
  audience: text,
  toName: text.nullable(),
  subject: text,
  body: text,
  byPush: bool,
  byWall: bool,
  byEmail: bool,
  people: count,
  walls: count,
  waiting: count,
});
const deletionRow = z.object({ userId: id, name: text.nullable(), email: text.nullable(), houseName: text.nullable(), requestedAt: at, deletesAt: at, requestedBy: text });
const reportRow = z.object({
  id,
  userId: id.nullable(),
  name: text.nullable(),
  email: text.nullable(),
  houseName: text.nullable(),
  kind: z.enum(REPORT_KINDS),
  state: z.enum(REPORT_STATES),
  words: text,
  createdAt: at,
  lastActivityAt: at,
  source: text,
  subject: text.nullable(),
  sameAsReportId: id.nullable(),
  also: count,
});
const houseRow = z.object({
  id,
  name: text,
  joinCode: text,
  people: count,
  passPlan: plan.nullable(),
  passEndsAt: at.nullable(),
  lastActive: at.nullable(),
  onTime: count,
  settled: count,
  createdAt: at,
  /** Last active, or "-infinity" for a house never active: the list's order, and its cursor. */
  sortAt: z.union([at, z.literal("-infinity")]),
});
const houseDetail = z.object({
  id,
  name: text,
  joinCode: text,
  createdAt: at,
  firstDealtAt: at.nullable(),
  timezone: text,
  currency: text,
  dealMode: text,
  passPlan: plan.nullable(),
  passUntil: at.nullable(),
  passBuyer: text.nullable(),
  billed: bool,
  lastActive: at.nullable(),
  johns: count,
  people: z.array(
    z.object({
      id,
      name: text,
      role,
      joinedAt: at,
      movingOutOn: day.nullable(),
      onTime: count,
      settled: count,
      awayUntil: day.nullable(),
    }),
  ),
});
const overview = z.object({
  span: z.enum(["week", "month"]),
  from: at,
  houses: count,
  housesNew: count,
  housesNewBefore: count,
  people: count,
  inHouses: count,
  active: count,
  passes: z.object({ monthly: count, yearly: count, founding: count, trial: count }),
  onTime: z.object({ onTime: count, late: count, missed: count }),
  ask: z.object({ turns: count, failed: count }),
  weeks: z.array(z.object({ ends: at, active: count })),
  clock: at.nullable(),
  reports: count,
  needs: z.array(z.object({ kind: z.enum(["report", "deletion"]), id: text, name: text.nullable(), words: text.nullable(), house: text.nullable(), at })),
});
/** A reset, its ids named as /v1 names them; `toRequest` gives the route's ResetRequest. */
const resetInput = ResetRequest.omit({ week: true, user: true, assignment: true }).extend({
  weekId: ResetRequest.shape.week,
  userId: ResetRequest.shape.user,
  assignmentId: ResetRequest.shape.assignment,
});
const historyRow = z.object({
  id,
  kind: text,
  doneBy: id.nullable(),
  subjectUserId: id.nullable(),
  assignmentId: id.nullable(),
  ref: id.nullable(),
  data: json,
  createdAt: at,
  undoneAt: at.nullable(),
  undoneBy: id.nullable(),
  reach: text,
});

// The rows the table operations answer with (table-rows.ts is each table as the database has it).
const crew = z.array(T.crew_members.pick({ userId: true, helper: true, points: true }));
const awayRow = T.away_periods.pick({ id: true, userId: true, startsOn: true, endsOn: true, note: true });
const balanceRow = z.object({ userId: id, owed: z.number(), credited: z.number() });
const chatSummary = z.object({ id, title: text, updatedAt: at });
const savedChat = z.object({ id, title: text, turns: z.array(SavedTurn) });
const turns = z.array(SavedTurn).max(CHAT_SAVED_TURNS);
const noticeFilter = { q, kind: z.enum(NOTICE_KINDS).nullable().optional(), state: z.enum(["live", "scheduled", "ended"]).nullable().optional(), ...span };
const auditFilter = { q, who: z.enum(AUDIT_WHO).optional(), what: z.enum(AUDIT_WHAT).optional(), ...span };
const auditEntry = T.admin_audit.pick({ id: true, createdAt: true, actor: true, action: true, targetKind: true, targetId: true, reason: true, before: true, after: true });
const today = z.object({
  house: T.houses,
  members: z.array(
    T.members
      .pick({ userId: true, role: true, streak: true, immunityTokens: true, swapTokens: true, suitsDays: true, bestTime: true, rather: true, movingOutOn: true, signsIn: true, bornYear: true })
      .extend({ name: text.nullable(), photo: text.nullable() }),
  ),
  week: T.weeks.pick({ id: true, startsOn: true, startsAt: true, endsAt: true, waiting: true, ahead: true }).nullable(),
  /** This week's, and any still open from before. */
  assignments: z.array(T.assignments.extend({ everyWeeks: int.nullable(), everyMonths: int.nullable(), crew })),
  disputes: z.array(
    T.disputes
      .pick({ id: true, assignmentId: true, raisedBy: true, reason: true, closesAt: true, photoPath: true })
      .extend({ votes: z.array(T.dispute_votes.pick({ userId: true, uphold: true })) }),
  ),
  onCall: z.array(
    T.on_call_picks.pick({ johnId: true, userId: true }).extend({ john: T.johns.pick({ name: true, category: true, needsPhoto: true, archivedAt: true }).nullable() }),
  ),
  offers: z.array(z.object({ id, mine: id, theirs: id, askedBy: id, askedUserId: id, expiresAt: at })),
  moves: z.object({ lastMovedOut: at.nullable(), lastJoined: at.nullable() }),
});

// --- Every operation ---------------------------------------------------------------------------

export const OPERATION_IO = {
  // Checks
  can: io(z.object({ houseId: id, permission: text }), bool, "GET /v1/houses/{houseId}/can", { args: { houseId: "h", permission: "perm" } }),
  my_permissions: io(z.object({ houseId: id }), z.array(text), "GET /v1/houses/{houseId}/permissions", { args: { houseId: "h" } }),
  is_member: io(z.object({ houseId: id }), bool, "GET /v1/houses/{houseId}/member", { args: { houseId: "h" } }),
  shares_house: io(z.object({ userId: id }), bool, "GET /v1/people/{userId}/shares-house", { args: { userId: "other" } }),
  runs_for: io(z.object({ houseId: id, kidId: id }), bool, "GET /v1/houses/{houseId}/kids/{kidId}/runs-for"),
  can_upload_proof: io(z.object({ path: text }), bool, "GET /v1/proofs/can-upload", { args: { path: "object_name" } }),
  can_app: io(z.object({ permission: text }), bool, "GET /v1/admin/can", { args: { permission: "perm" } }),
  is_owner: io(none, bool, "GET /v1/admin/owner"),
  my_app_role: io(none, z.enum(["owner", "support"]).nullable(), "GET /v1/admin/role"),
  my_app_permissions: io(none, z.array(text), "GET /v1/admin/permissions"),
  owner_status: io(none, z.object({ owner: bool, mfa: bool, role: z.enum(["owner", "support"]).nullable(), permissions: z.array(text) }), "GET /v1/admin/status"),

  // Your account
  create_house: io(
    z.object({ name: text, timezone: text, currency: z.enum(CURRENCIES), weekStarts: z.int().min(1).max(7), kind: z.enum(HOUSE_KINDS).optional() }),
    id,
    "POST /v1/houses",
  ),
  start_house_from: io(
    z.object({ fromId: id, name: text, timezone: text, currency: z.enum(CURRENCIES), weekStarts: z.int().min(1).max(7) }),
    id,
    "POST /v1/houses/{fromId}/next",
  ),
  house_by_code: io(
    z.object({ code: text }),
    z.array(
      z.object({
        id,
        name: text,
        members: count,
        kind: z.enum(HOUSE_KINDS),
        currency: z.enum(CURRENCIES),
        stakeMinor: count,
        lateForfeitMinor: count,
        missedForfeitMinor: count,
      }),
    ),
    "GET /v1/houses/by-code/{code}",
  ),
  join_house: io(z.object({ code: text }), id, "POST /v1/houses/by-code/{code}/join"),
  set_my_photo: io(z.object({ photo: text.nullable() }), nothing, "PATCH /v1/me/photo", { args: { photo: "photo" } }),
  set_away: io(AwayDraft, AwayResponse, "POST /v1/me/away"),
  cancel_away: io(z.object({ awayId: id }), nothing, "DELETE /v1/me/away/{awayId}"),
  set_moving_out: io(z.object({ on: day.nullable() }), nothing, "PATCH /v1/me/moving-out"),
  moving_on: io(
    none,
    z.array(
      z.object({
        fromHouseId: id,
        houseName: text,
        johns: count,
        leftAt: at,
        passPlan: plan.nullable(),
        passState: text.nullable(),
        housePassUntil: day.nullable(),
      }),
    ),
    "GET /v1/me/moving-on",
  ),
  leave_pass: io(none, nothing, "POST /v1/me/pass/leave"),
  account_deletion_preview: io(none, z.object({ house: text.nullable(), passUntil: at.nullable(), deleteAfter: at }), "GET /v1/me/deletion/preview"),
  account_deletion_status: io(none, z.object({ deleteAfter: at, requestedBy: text }).nullable(), "GET /v1/me/deletion"),
  request_account_deletion: io(none, at, "POST /v1/me/deletion"),
  keep_account: io(none, nothing, "DELETE /v1/me/deletion"),
  my_reports: io(
    none,
    z.array(
      z.object({
        id,
        kind: z.enum(REPORT_KINDS),
        state: z.enum(REPORT_STATES),
        words: text,
        createdAt: at,
        lastActivityAt: at,
        replies: count,
        unread: bool,
      }),
    ),
    "GET /v1/me/reports",
  ),
  send_report: io(ReportRequest, ReportResponse, "POST /v1/me/reports"),
  write_back: io(ReportMessageRequest.extend({ reportId: id }), ReportMessageResponse, "POST /v1/me/reports/{reportId}/messages"),
  see_report: io(z.object({ reportId: id }), nothing, "POST /v1/me/reports/{reportId}/seen"),
  my_report: io(
    z.object({ reportId: id }),
    z
      .object({
        report: T.reports.pick({ id: true, userId: true, kind: true, state: true, words: true, details: true, shots: true, createdAt: true, source: true, subject: true }),
        messages: z.array(T.report_messages.pick({ fromOwner: true, authorName: true, body: true, createdAt: true })),
      })
      .nullable(),
    "GET /v1/me/reports/{reportId}",
  ),
  my_house: io(none, z.object({ houseId: id, name: text, kind: z.enum(HOUSE_KINDS) }).nullable(), "GET /v1/me/house"),
  set_my_name: io(z.object({ name: DisplayName }), nothing, "PATCH /v1/me/name"),
  my_notifications: io(
    none,
    T.notification_prefs.pick({ reminders: true, checks: true, flags: true, deal: true, quietFrom: true, quietUntil: true, timezone: true }).nullable(),
    "GET /v1/me/notifications",
  ),
  save_notifications: io(NotificationPrefsDraft, nothing, "PATCH /v1/me/notifications"),
  add_push_device: io(z.object({ endpoint: z.url(), p256dh: text, auth: text }), nothing, "POST /v1/me/push-devices"),
  remove_push_device: io(z.object({ endpoint: z.url() }), nothing, "DELETE /v1/me/push-devices"),
  my_ask_chats: io(z.object({ houseId: id }), z.array(chatSummary), "GET /v1/houses/{houseId}/me/ask-chats"),
  my_ask_chat: io(z.object({ chatId: id }), savedChat, "GET /v1/me/ask-chats/{chatId}"),
  keep_ask_chat: io(z.object({ houseId: id, turns }), id, "POST /v1/houses/{houseId}/me/ask-chats"),
  update_ask_chat: io(z.object({ chatId: id, turns }), nothing, "PATCH /v1/me/ask-chats/{chatId}"),
  delete_ask_chat: io(z.object({ chatId: id }), nothing, "DELETE /v1/me/ask-chats/{chatId}"),
  live_notices: io(none, z.array(Notice), "GET /v1/notices"),

  // A house: reading
  house_history: io(z.object({ houseId: id, before: at.optional(), limit: z.int().min(1).max(200).optional() }), z.array(historyRow), "GET /v1/houses/{houseId}/history"),
  ask_usage: io(z.object({ houseId: id }), AskUsage, "GET /v1/houses/{houseId}/ask/usage"),
  catch_up: io(FreshRequest, FreshResponse, "POST /v1/houses/{houseId}/catch-up"),
  house_today: io(z.object({ houseId: id }), today, "GET /v1/houses/{houseId}/today"),
  john_list: io(
    z.object({ houseId: id }),
    z.object({
      johns: z.array(
        T.johns.pick({
          id: true,
          name: true,
          category: true,
          points: true,
          everyWeeks: true,
          everyMonths: true,
          weekOfMonth: true,
          anchorMonth: true,
          anchorWeek: true,
          dueDow: true,
          dueTime: true,
          needsPhoto: true,
          groupId: true,
          kind: true,
          respondHours: true,
          perWeek: true,
          crew: true,
          keepDay: true,
          payMinor: true,
          minAge: true,
        }),
      ),
      groups: z.array(z.object({ id, name: text, members: z.array(id) })),
    }),
    "GET /v1/houses/{houseId}/johns",
  ),
  house_wall: io(
    z.object({ houseId: id, ...pageInput }),
    pageOutput(
      T.events
        .pick({ id: true, kind: true, userId: true, assignmentId: true, data: true, createdAt: true })
        .extend({ photoPath: text.nullable(), reactions: z.array(T.reactions.pick({ userId: true, kind: true })) }),
    ),
    "GET /v1/houses/{houseId}/wall",
    { page: pageOf("createdAt") },
  ),
  house_away: io(z.object({ houseId: id, from: day }), z.array(awayRow), "GET /v1/houses/{houseId}/away"),
  house_month: io(
    z.object({ houseId: id, month }),
    z.object({
      assignments: z.array(
        T.assignments
          .pick({ id: true, userId: true, points: true, outcome: true, doneAt: true, dueAt: true, excused: true, coveredBy: true, flaggedAt: true, closesAt: true, jobId: true, absentAt: true })
          .extend({ weekEndsAt: at, crew }),
      ),
      /** The usual weeks before this one: each person's share of each. */
      recentShares: z.array(T.week_shares.pick({ userId: true, share: true })),
      /** Every week before this one, summed. */
      totals: z.array(balanceRow),
    }),
    "GET /v1/houses/{houseId}/month/{month}",
  ),
  house_balances: io(z.object({ houseId: id, before: day }), z.array(balanceRow), "GET /v1/houses/{houseId}/balances"),
  house_record: io(
    z.object({ houseId: id }),
    z.object({
      weeks: z.array(T.weeks.pick({ id: true, startsOn: true, startsAt: true, endsAt: true, skippedAt: true })),
      away: z.array(awayRow),
      shares: z.array(T.week_shares.pick({ weekId: true, userId: true, share: true })),
      assignments: z.array(
        T.assignments.pick({
          id: true,
          weekId: true,
          userId: true,
          name: true,
          points: true,
          dueAt: true,
          doneAt: true,
          outcome: true,
          excused: true,
          coveredBy: true,
          changedBy: true,
          jobId: true,
          absentAt: true,
        }),
      ),
      crew: z.array(T.crew_members.pick({ jobId: true, assignmentId: true, userId: true, helper: true, points: true })),
    }),
    "GET /v1/houses/{houseId}/record",
  ),
  house_stake: io(
    z.object({ houseId: id }),
    z.object({
      ledger: z.array(
        T.ledger_entries
          .pick({ id: true, userId: true, kind: true, amountMinor: true, month: true, counterpartyUserId: true, doers: true, createdAt: true })
          .extend({ john: T.assignments.pick({ name: true, outcome: true, dueAt: true }).nullable() }),
      ),
      closedMonths: z.array(text),
    }),
    "GET /v1/houses/{houseId}/stake",
  ),
  house_pocket: io(
    z.object({ houseId: id }),
    z.object({
      earnings: z.array(T.pocket_earnings.pick({ userId: true, month: true, amountMinor: true })),
      pays: z.array(T.pocket_pays.pick({ userId: true, month: true, amountMinor: true, paidBy: true, createdAt: true })),
    }),
    "GET /v1/houses/{houseId}/pocket-money",
  ),

  // A house: your own Johns
  mark_done: io(z.object({ assignmentId: id, photoPath: text.optional() }), nothing, "POST /v1/assignments/{assignmentId}/done"),
  undo_done: io(z.object({ assignmentId: id }), nothing, "POST /v1/assignments/{assignmentId}/undo"),
  plan_john: io(z.object({ assignmentId: id, at }), nothing, "POST /v1/assignments/{assignmentId}/plan"),
  roll_call: io(RollCallRequest, RollCallResponse, "POST /v1/assignments/{assignmentId}/roll-call"),
  save_prefs: io(
    z.object({
      houseId: id,
      days: z.array(z.literal([1, 2, 3, 4, 5, 6, 7])),
      bestTime: z.enum(BEST_TIMES).nullable(),
      /** John id → 1 rather do, −1 rather not. */
      rather: z.record(id, z.literal([1, -1])),
    }),
    nothing,
    "PATCH /v1/houses/{houseId}/me/prefs",
  ),
  use_immunity: io(z.object({ assignmentId: id }), nothing, "POST /v1/assignments/{assignmentId}/immunity"),
  use_swap: io(z.object({ mine: id, theirs: id }), nothing, "POST /v1/assignments/{mine}/swap-token"),
  offer_swap: io(SwapAskRequest, SwapAskResponse, "POST /v1/swaps"),
  answer_swap: io(z.object({ offerId: id, accept: bool }), nothing, "POST /v1/swaps/{offerId}/answer"),
  answer_dispute: io(z.object({ disputeId: id, photoPath: text }), bool, "POST /v1/disputes/{disputeId}/answer"),
  undo_action: io(z.object({ actionId: id }), nothing, "POST /v1/actions/{actionId}/undo"),
  undo_latest: io(z.object({ kind: text, aboutId: id.optional() }), id.nullable(), "POST /v1/me/actions/undo-latest"),

  // A house: anyone in it
  cover_john: io(z.object({ assignmentId: id, photoPath: text.optional() }), nothing, "POST /v1/assignments/{assignmentId}/cover"),
  hold_cover: io(z.object({ assignmentId: id }), at, "POST /v1/assignments/{assignmentId}/cover/hold"),
  undo_cover: io(z.object({ assignmentId: id }), nothing, "DELETE /v1/assignments/{assignmentId}/cover"),
  raise_flag: io(RaiseFlag, FlagResponse, "POST /v1/johns/{johnId}/flags"),
  raise_dispute: io(RaiseDispute, MoveResponse, "POST /v1/assignments/{assignmentId}/disputes"),
  cast_vote: io(CastVote.extend({ disputeId: id }), MoveResponse, "POST /v1/disputes/{disputeId}/votes"),
  confirm_payment: io(z.object({ houseId: id, fromId: id, amount: z.int().min(1), via: text.optional() }), nothing, "POST /v1/houses/{houseId}/payments"),
  ask_house: io(ChatRequest, ChatResponse, "POST /v1/houses/{houseId}/ask"),
  pass_checkout: io(PassCheckoutRequest, PassRedirect, "POST /v1/houses/{houseId}/pass/checkout"),
  pass_billing: io(PassManageRequest, PassRedirect, "POST /v1/houses/{houseId}/pass/billing"),

  react: io(z.object({ eventId: id, kind: z.enum(REACTIONS) }), nothing, "POST /v1/events/{eventId}/reactions"),
  unreact: io(z.object({ eventId: id, kind: z.enum(REACTIONS) }), nothing, "DELETE /v1/events/{eventId}/reactions/{kind}"),

  // A house: admins (Parents)
  add_john: io(JohnFields.extend({ houseId: id }).refine(...johnMonthly), id, "POST /v1/houses/{houseId}/johns"),
  add_johns: io(z.object({ houseId: id, johns: z.array(JohnFields.refine(...johnMonthly)).min(1).max(100) }), z.array(id), "POST /v1/houses/{houseId}/johns/batch"),
  change_john: io(JohnFields.extend({ johnId: id }).refine(...johnMonthly), nothing, "PATCH /v1/johns/{johnId}"),
  remove_john: io(z.object({ johnId: id }), nothing, "DELETE /v1/johns/{johnId}"),
  save_house_rules: io(HouseSettings.extend({ houseId: id }), nothing, "PATCH /v1/houses/{houseId}/rules"),
  set_deal_mode: io(z.object({ houseId: id, mode: z.enum(DEAL_MODES) }), nothing, "PATCH /v1/houses/{houseId}/deal-mode"),
  answer_tick: io(AnswerTick.extend({ assignmentId: id }), MoveResponse, "POST /v1/assignments/{assignmentId}/ok"),
  board_tick: io(z.object({ assignmentId: id }), nothing, "POST /v1/assignments/{assignmentId}/board-tick"),
  remove_flag: io(z.object({ assignmentId: id }), nothing, "DELETE /v1/assignments/{assignmentId}/flag"),
  save_group: io(z.object({ houseId: id, groupId: id.nullable(), name: text, members: z.array(id) }), id, "POST /v1/houses/{houseId}/groups"),
  delete_group: io(z.object({ groupId: id }), nothing, "DELETE /v1/groups/{groupId}"),
  reset_join_code: io(z.object({ houseId: id }), text, "POST /v1/houses/{houseId}/join-code"),
  set_house_kind: io(z.object({ houseId: id, kind: z.enum(HOUSE_KINDS) }), day.nullable(), "PATCH /v1/houses/{houseId}/kind"),
  deal_week: io(DealRequest, MoveResponse, "POST /v1/houses/{houseId}/deal"),
  reset_house: io(resetInput, ResetResponse, "POST /v1/houses/{houseId}/resets", {
    toRequest: ({ weekId, userId, assignmentId, ...rest }: z.infer<typeof resetInput>): ResetRequest => ({ ...rest, week: weekId, user: userId, assignment: assignmentId }),
  }),
  pay_pocket_money: io(z.object({ houseId: id, kidId: id, month }), int, "POST /v1/houses/{houseId}/kids/{kidId}/pocket-money"),
  add_kid: io(AddKid.extend({ houseId: id }), AddKidResponse, "POST /v1/houses/{houseId}/kids"),
  remove_member: io(z.object({ houseId: id, userId: id }), nothing, "DELETE /v1/houses/{houseId}/members/{userId}"),
  set_member_role: io(z.object({ houseId: id, userId: id, role }), nothing, "PATCH /v1/houses/{houseId}/members/{userId}"),
  hand_over: io(z.object({ houseId: id, toId: id }), nothing, "POST /v1/houses/{houseId}/members/{toId}/hand-over"),

  // The admin pages
  owner_overview: io(z.object({ span: z.enum(["week", "month"]).optional(), zone: text.optional() }), overview, "GET /v1/admin/overview"),
  owner_houses_find: io(z.object({ q: text }), z.array(z.object({ id, name: text, people: count })), "GET /v1/admin/houses/find"),
  owner_houses_page: io(
    z.object({ q, pass: z.enum(["paid", "trial", "none"]).nullable().optional(), active: z.enum(["week", "month", "quiet"]).nullable().optional(), ...span, ...pageInput }),
    pageOutput(houseRow),
    "GET /v1/admin/houses",
    { page: pageOf("sortAt") },
  ),
  owner_houses_count: io(
    z.object({ q, pass: z.enum(["paid", "trial", "none"]).nullable().optional(), active: z.enum(["week", "month", "quiet"]).nullable().optional(), ...span }),
    count,
    "GET /v1/admin/houses/count",
  ),
  owner_house: io(z.object({ houseId: id }), houseDetail.nullable(), "GET /v1/admin/houses/{houseId}"),
  owner_people_find: io(z.object({ q: text }), z.array(z.object({ id, name: text.nullable(), email: text.nullable(), houseId: id.nullable(), houseName: text.nullable() })), "GET /v1/admin/people/find"),
  owner_reports_page: io(
    z.object({ q, state: text.nullable().optional(), kind: z.enum(REPORT_KINDS).nullable().optional(), from: text.nullable().optional(), ...span, ...pageInput }),
    pageOutput(reportRow),
    "GET /v1/admin/reports",
    { page: pageOf("createdAt") },
  ),
  owner_reports_count: io(
    z.object({ q, state: text.nullable().optional(), kind: z.enum(REPORT_KINDS).nullable().optional(), from: text.nullable().optional(), ...span }),
    count,
    "GET /v1/admin/reports/count",
  ),
  owner_same_as_find: io(z.object({ reportId: id, q }), z.array(z.object({ id, name: text.nullable(), words: text, state: text, createdAt: at })), "GET /v1/admin/reports/{reportId}/same-as"),
  owner_messages_find: io(z.object({ q, audience: text.nullable().optional(), way: text.nullable().optional(), ...span }), z.array(messageRow), "GET /v1/admin/messages/find"),
  owner_messages_page: io(
    z.object({ q, audience: text.nullable().optional(), way: text.nullable().optional(), ...span, ...pageInput }),
    pageOutput(messageRow),
    "GET /v1/admin/messages",
    { page: pageOf("sentAt") },
  ),
  owner_messages_count: io(z.object({ q, audience: text.nullable().optional(), way: text.nullable().optional(), ...span }), count, "GET /v1/admin/messages/count"),
  owner_message_reach: io(
    z.object({ audience: z.enum([...MESSAGE_AUDIENCES, "test"]), personId: id.nullable().optional(), houseId: id.nullable().optional() }),
    z.object({ people: count, push: count, email: count, houses: count }),
    "GET /v1/admin/messages/reach",
  ),
  owner_promotion: io(z.object({ promotionId: id }), promotion.nullable(), "GET /v1/admin/promotions/{promotionId}", { args: { promotionId: "p_id" } }),
  owner_promotions_find: io(z.object({ q, who: text.nullable().optional(), state: text.nullable().optional() }), z.array(promotionRow), "GET /v1/admin/promotions/find"),
  owner_promotions_page: io(
    z.object({ q, who: text.nullable().optional(), state: text.nullable().optional(), ...pageInput }),
    pageOutput(promotionRow),
    "GET /v1/admin/promotions",
    { page: pageOf("madeAt") },
  ),
  owner_promotions_count: io(z.object({ q, who: text.nullable().optional(), state: text.nullable().optional() }), count, "GET /v1/admin/promotions/count"),
  owner_deletions: io(none, z.array(deletionRow), "GET /v1/admin/deletions/all"),
  owner_deletions_page: io(
    z.object({ q, by: text.nullable().optional(), goes: text.nullable().optional(), ...span, ...pageInput }),
    pageOutput(deletionRow),
    "GET /v1/admin/deletions",
    { page: pageOf("deletesAt", "userId", "p_cursor_user") },
  ),
  owner_deletions_count: io(z.object({ q, by: text.nullable().optional(), goes: text.nullable().optional(), ...span }), count, "GET /v1/admin/deletions/count"),
  claim_owner_ask: io(z.object({ question: text, limit: int }), id, "POST /v1/admin/ask/turns"),
  finish_owner_ask: io(z.object({ turnId: id, reply: text, input: count, output: count }), nothing, "PATCH /v1/admin/ask/turns/{turnId}"),
  ask_owner: io(OwnerAskRequest, OwnerAskResponse, "POST /v1/admin/ask"),
  owner_reply_report: io(ReportMessageRequest.extend({ reportId: id }), ReportMessageResponse, "POST /v1/admin/reports/{reportId}/reply"),
  owner_fix_report: io(ReportFixRequest.extend({ reportId: id }), ReportFixResponse, "POST /v1/admin/reports/{reportId}/fixed"),
  owner_open_report: io(z.object({ reportId: id }), report, "POST /v1/admin/reports/{reportId}/open"),
  owner_set_report_state: io(z.object({ reportId: id, state: z.enum(REPORT_STATES) }), nothing, "PATCH /v1/admin/reports/{reportId}"),
  owner_same_as: io(z.object({ reportId: id, mainId: id.nullable() }), id.nullable(), "PATCH /v1/admin/reports/{reportId}/same-as"),
  claim_support_draft: io(z.object({ reportId: id }), SupportDraftResponse, "POST /v1/admin/reports/{reportId}/draft"),
  finish_support_draft: io(
    z.object({ draftId: id, reply: text, action: z.enum(["none", "same_as", "delete"]), sameAsId: id.nullable(), why: text, input: count, output: count }),
    supportDraft,
    "PATCH /v1/admin/drafts/{draftId}",
  ),
  owner_set_support_draft: io(z.object({ draftId: id, state: text }), nothing, "PATCH /v1/admin/drafts/{draftId}/state"),
  save_notice: io(
    z.object({
      noticeId: id.nullable(),
      kind: z.enum(NOTICE_KINDS),
      title: text,
      body: text,
      linkLabel: text.nullable(),
      linkUrl: text.nullable(),
      startsAt: at.nullable(),
      endsAt: at.nullable(),
    }),
    id,
    "POST /v1/admin/notices",
    { args: { noticeId: "p_id" } },
  ),
  end_notice: io(z.object({ noticeId: id }), nothing, "DELETE /v1/admin/notices/{noticeId}", { args: { noticeId: "p_id" } }),
  write_notice_copy: io(none, z.object({ copied: bool }), "POST /v1/admin/notices/copy"),
  owner_send_message: io(OwnerMessageRequest, OwnerMessageResponse, "POST /v1/admin/messages"),
  owner_make_promotion: io(PromotionRequest, PromotionMade, "POST /v1/admin/promotions"),
  retry_promotion: io(z.object({ promotionId: id }), z.object({ ok: z.literal(true), ready: bool }), "POST /v1/admin/promotions/{promotionId}/retry"),
  owner_stop_promotion: io(z.object({ promotionId: id }), MoveResponse, "POST /v1/admin/promotions/{promotionId}/stop", { args: { promotionId: "p_id" } }),
  owner_promotion_emails: io(z.object({ promotionId: id }), PromotionEmailed, "POST /v1/admin/promotions/{promotionId}/email", { args: { promotionId: "p_id" } }),
  owner_delete_now: io(z.object({ userId: id, reason: text.optional() }), nothing, "DELETE /v1/admin/people/{userId}"),
  owner_request_deletion: io(z.object({ email: z.email(), reason: text.optional() }), id, "POST /v1/admin/deletions"),
  owner_stop_deletion: io(z.object({ userId: id, reason: text.optional() }), nothing, "DELETE /v1/admin/deletions/{userId}"),
  owner_delete_house: io(DeleteHouseRequest.extend({ houseId: id }), DeleteHouseResponse, "DELETE /v1/admin/houses/{houseId}"),
  owner_notices_page: io(z.object({ ...noticeFilter, ...pageInput }), pageOutput(Notice), "GET /v1/admin/notices", { page: pageOf("startsAt") }),
  owner_notices_count: io(z.object(noticeFilter), count, "GET /v1/admin/notices/count"),
  owner_audit_page: io(z.object({ ...auditFilter, ...pageInput }), pageOutput(auditEntry), "GET /v1/admin/audit", { page: pageOf("createdAt") }),
  owner_audit_count: io(z.object(auditFilter), count, "GET /v1/admin/audit/count"),
  owner_audit_entry: io(z.object({ entryId: z.int().min(1) }), auditEntry.nullable(), "GET /v1/admin/audit/{entryId}"),
  owner_ask_chats: io(none, z.array(chatSummary), "GET /v1/admin/ask-chats"),
  owner_ask_chat: io(z.object({ chatId: id }), savedChat, "GET /v1/admin/ask-chats/{chatId}"),
  keep_owner_ask_chat: io(z.object({ turns }), id, "POST /v1/admin/ask-chats"),
  update_owner_ask_chat: io(z.object({ chatId: id, turns }), nothing, "PATCH /v1/admin/ask-chats/{chatId}"),
  delete_owner_ask_chat: io(z.object({ chatId: id }), nothing, "DELETE /v1/admin/ask-chats/{chatId}"),
} as const satisfies Record<OperationName, OperationIo>;

// --- Turning it into calls ---------------------------------------------------------------------

/** Rows on a page when the caller doesn't say. */
export const PAGE_LIMIT = 50;

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** The database argument an input key goes to. */
export function argName(name: OperationName, key: string): string {
  const io: OperationIo = OPERATION_IO[name];
  return io.args?.[key] ?? `p_${snake(key.replace(/Id$/, ""))}`;
}

/** An operation's input as its database function's arguments. Paging keys are the page's (`fromPage`). */
export function rpcArgs(name: OperationName, input: Record<string, unknown>): Record<string, unknown> {
  const io: OperationIo = OPERATION_IO[name];
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (io.page && (key === "limit" || key === "startingAfter")) continue;
    args[argName(name, key)] = value;
  }
  if (io.page) {
    const limit = typeof input.limit === "number" ? input.limit : PAGE_LIMIT;
    // One more than asked for says whether there's another page.
    args.p_limit = limit + 1;
    const cursor = typeof input.startingAfter === "string" ? readCursor(input.startingAfter) : null;
    if (cursor && io.page.atArg && io.page.idArg) {
      args[io.page.atArg] = cursor.at;
      args[io.page.idArg] = cursor.id;
    }
  }
  return args;
}

const readCursor = (cursor: string): { at: string; id: string } | null => {
  try {
    const parsed = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/"))) as unknown;
    // An id is a uuid, or a number for a table counted by identity (admin_audit).
    const ok = z.object({ at: text, id: z.union([text, z.number()]).transform(String) }).safeParse(parsed);
    return ok.success ? ok.data : null;
  } catch {
    return null;
  }
};

/** The cursor for the page after this row. */
export function pageCursor(name: OperationName, row: Record<string, unknown>): string {
  const io: OperationIo = OPERATION_IO[name];
  if (!io.page) throw new Error(`${name} isn't read a page at a time`);
  return btoa(JSON.stringify({ at: row[io.page.at], id: row[io.page.id] }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A database answer with every object key camelCase, as `output` has it. */
export function camelKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [camel(k), camelKeys(v)]));
  }
  return value;
}

/** A page read's rows as its output: `limit` of them, whether there are more, and the cursor for them. */
export function fromPage(name: OperationName, input: { limit?: number }, rows: readonly unknown[]): { data: unknown[]; hasMore: boolean; startingAfter: string | null } {
  const limit = input.limit ?? PAGE_LIMIT;
  const data = rows.slice(0, limit).map(camelKeys);
  const hasMore = rows.length > limit;
  const last = data.at(-1) as Record<string, unknown> | undefined;
  return { data, hasMore, startingAfter: hasMore && last ? pageCursor(name, last) : null };
}

/** The input keys an http path names, in order: "/v1/houses/{houseId}/kids/{kidId}" is houseId, kidId. */
export function pathKeys(route: HttpRoute): string[] {
  return [...route.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]);
}
