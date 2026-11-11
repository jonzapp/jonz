/**
 * Week's look ahead in Steady weeks, from what the deal kept on the week
 * (steady-deal.ts weekStateOf): the Johns waiting their turn and when it
 * comes, whose turn is next for the Johns not out this week (Smart), and
 * Classic's next two weeks, person by person. Nothing silently disappears:
 * a John that waits stays on Week until its turn. Pure.
 */

import type { JohnDef } from "./board";
import type { Words } from "./words-for";
import { firstName, dateIn } from "./format";
import { johnKind } from "./john-row";
import type { SteadyAheadWeek } from "./steady-deal";
import type { DealMode } from "./domain";

type WeekJohn = Pick<JohnDef, "id" | "name" | "category" | "points" | "when" | "crew">;

export interface WaitingRow {
  johnId: string;
  name: string;
  category: string;
  points: number;
  /** "Bins, next week"; "Floors, week of 16 Nov"; "Bins, waiting 2 weeks" past what the deal looked ahead to. */
  meta: string;
}

export interface TurnRow {
  johnId: string;
  name: string;
  category: string;
  points: number;
  /** Whose turn it is. */
  userId: string;
  /** "Floors, Ada’s turn, next week". */
  meta: string;
}

export interface AheadPerson {
  userId: string;
  /** "You", or their first name. */
  who: string;
  johns: string[];
  points: number;
}

export interface AheadSection {
  startsOn: string;
  /** "Next week"; "Week of 16 Nov". */
  label: string;
  people: AheadPerson[];
}

/** A week ahead in a sentence: "next week" for the first, "week of 16 Nov" after. */
function whenOf(startsOn: string, k: number, words: Words): string {
  if (k === 0) return words('week.steady.nextWeek');
  return words('week.steady.weekOf', { date: dateIn(new Date(`${startsOn}T12:00:00Z`), "dayMonth", "UTC", words) });
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The first week ahead a John is handed out in, and to whom. */
function firstTurn(ahead: readonly SteadyAheadWeek[], johnId: string): { k: number; userIds: string[] } | null {
  const k = ahead.findIndex((w) => (w.johns[johnId]?.length ?? 0) > 0);
  return k < 0 ? null : { k, userIds: ahead[k].johns[johnId] };
}

/** Week's "Waiting their turn": every John left waiting, longest waiting first, with when its turn comes. */
export function waitingRows(
  list: readonly WeekJohn[],
  state: { waiting: Readonly<Record<string, number>>; ahead: readonly SteadyAheadWeek[] }, words: Words,
): WaitingRow[] {
  return list
    .filter((j) => (state.waiting[j.id] ?? 0) > 0)
    .map((j) => ({ j, weeks: state.waiting[j.id] }))
    .sort((a, b) => b.weeks - a.weeks || a.j.name.localeCompare(b.j.name))
    .map(({ j, weeks }) => {
      const turn = firstTurn(state.ahead, j.id);
      return {
        johnId: j.id,
        name: j.name,
        category: j.category,
        points: j.points,
        meta: `${johnKind(j.category)}, ${turn ? whenOf(state.ahead[turn.k].startsOn, turn.k, words) : words('week.steady.waitingFor', { weeks })}`,
      };
    });
}

/**
 * Smart's "Whose turn next": the Johns on the list that aren't out this
 * week and aren't waiting, done by one, in the weeks the deal looked ahead
 * to, soonest first.
 */
export function turnRows(
  list: readonly WeekJohn[],
  state: { waiting: Readonly<Record<string, number>>; ahead: readonly SteadyAheadWeek[] },
  /** The Johns out this week, by the John they were dealt from. */
  outNow: ReadonlySet<string>,
  viewerId: string,
  nameOf: (userId: string) => string | null, words: Words,
): TurnRow[] {
  const rows: { k: number; row: TurnRow }[] = [];
  for (const j of list) {
    if (j.when === "on_call" || j.crew !== 1 || outNow.has(j.id) || state.waiting[j.id]) continue;
    const turn = firstTurn(state.ahead, j.id);
    if (!turn) continue;
    const userId = turn.userIds[0];
    const when = whenOf(state.ahead[turn.k].startsOn, turn.k, words);
    rows.push({
      k: turn.k,
      row: {
        johnId: j.id,
        name: j.name,
        category: j.category,
        points: j.points,
        userId,
        meta: `${johnKind(j.category)}, ${words('week.steady.turnOf', { whose: whose(userId, viewerId, nameOf, words), when })}`,
      },
    });
  }
  return rows.sort((a, b) => a.k - b.k || a.row.name.localeCompare(b.row.name)).map((r) => r.row);
}

/** Classic's next two weeks: who has what, you first, then everyone in the order they joined. */
export function aheadSections(
  list: readonly WeekJohn[],
  ahead: readonly SteadyAheadWeek[],
  memberIds: readonly string[],
  viewerId: string,
  nameOf: (userId: string) => string | null,
  words: Words,
): AheadSection[] {
  const johnOf = new Map(list.map((j) => [j.id, j]));
  const order = [viewerId, ...memberIds.filter((id) => id !== viewerId)].filter((id) => memberIds.includes(id));
  return ahead.map((w, k) => ({
    startsOn: w.startsOn,
    label: capital(whenOf(w.startsOn, k, words)),
    people: order
      .map((userId) => {
        const johns = Object.entries(w.johns)
          .filter(([id, ids]) => ids.includes(userId) && johnOf.has(id))
          .map(([id]) => johnOf.get(id)!);
        return {
          userId,
          who: userId === viewerId ? words('week.table.you') : named(nameOf(userId), words),
          johns: johns.map((j) => j.name),
          points: johns.reduce((s, j) => s + j.points, 0),
        };
      })
      .filter((p) => p.johns.length > 0),
  }));
}

function named(name: string | null, words: Words): string {
  return name ? firstName(name) : words('common.shell.formerHousemate');
}

/** "your", or "Ada’s". */
function whose(userId: string, viewerId: string, nameOf: (userId: string) => string | null, words: Words): string {
  return userId === viewerId ? words('week.steady.yourTurn') : `${named(nameOf(userId), words)}’s`;
}

/**
 * Everything Week shows of the look ahead, for the house's mode: the Johns
 * waiting, Smart's whose turn next or Classic's next two weeks, and which
 * long Johns "Coming up" should still list (those nothing above names).
 */
export function weekLookAhead<J extends WeekJohn>(args: {
  list: readonly J[];
  state: { waiting: Readonly<Record<string, number>>; ahead: readonly SteadyAheadWeek[] };
  mode: DealMode;
  /** This week's Johns (not those carried from last week), by the John they were dealt from. */
  items: readonly { johnId: string | null; carried: boolean }[];
  memberIds: readonly string[];
  viewerId: string;
  nameOf: (userId: string) => string | null;
  words: Words;
}, words: Words): { waiting: WaitingRow[]; turns: TurnRow[]; weeks: AheadSection[]; comingUp: J[] } {
  const { list, state, viewerId, nameOf } = args;
  const outNow = new Set(args.items.filter((i) => !i.carried && i.johnId).map((i) => i.johnId!));
  const waiting = waitingRows(list, state, words);
  const classic = args.mode === "classic";
  const turns = classic ? [] : turnRows(list, state, outNow, viewerId, nameOf, words);
  const weeks = classic ? aheadSections(list, state.ahead, args.memberIds, viewerId, nameOf, args.words).filter((w) => w.people.length) : [];
  const named = new Set([...waiting, ...turns].map((r) => r.johnId));
  for (const w of state.ahead) if (classic) for (const id of Object.keys(w.johns)) named.add(id);
  return { waiting, turns, weeks, comingUp: list.filter((j) => !named.has(j.id)) };
}
