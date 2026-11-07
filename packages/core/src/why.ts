/**
 * The John sheet's "Why?": why the deal gave a John to whom it did, how it
 * added up, and what slipping would cost, or once it's settled, whose work
 * it counted as. Read from what the deal kept (BoardItem.dealt), so it says
 * what the deal did rather than replaying it.
 */
import type { BoardItem } from "./board";
import { isOpen } from "./board";
import { CREW_COPY, WHY_COPY } from "./copy";
import { shareLabel } from "./crew";
import type { HouseRules } from "./domain";
import { dueInLine, firstName, formatBalance } from "./format";
import { coverOpensAt } from "./outcome";

interface Person {
  userId: string;
  name: string;
}

export interface WhyRow {
  userId: string;
  /** "You", or their first name. */
  name: string;
  /** Where they stood against their share: "−2.5", "level", "+1". */
  value: string;
  /** "Dealt it", "Had it last time", "Already handed the most extra", joined; null when none. */
  meta: string | null;
  /** The one it was dealt to. */
  chosen: boolean;
}

export interface WhyView {
  /** Why it went where it did: a sentence or a few. */
  answer: string;
  /** How it added up: each sharer home that day, furthest behind first. Empty when there was nobody to weigh against. */
  rows: WhyRow[];
  /** Under the rows: what their figures are. */
  key: string;
  /** What slipping would cost while it's open; whose work it counts as once it's done. */
  stakes: string | null;
}

/** "Ben", "Ben and Cal", "Ben, Cal and Dee". */
function andList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function johnWhy(
  item: BoardItem,
  people: readonly Person[],
  viewerId: string,
  rules: HouseRules,
  now: Date,
  /** A John done together's places on the board (its job's), to say why the people on it are. */
  places: readonly BoardItem[] = [item],
): WhyView {
  const name = (id: string) => {
    const person = people.find((p) => p.userId === id);
    return person ? firstName(person.name) : WHY_COPY.someoneGone;
  };
  /** At the start of a sentence: "You", "Ben". */
  const Who = (id: string) => (id === viewerId ? WHY_COPY.You : name(id));
  /** Mid-sentence: "you", "Ben". */
  const who = (id: string) => (id === viewerId ? WHY_COPY.you : name(id));
  const whose = (id: string) => (id === viewerId ? WHY_COPY.your : `${name(id)}’s`);

  const together = places.length > 1 ? togetherPart(places, viewerId, { Who, who }) : null;
  const dealt = item.dealt;
  const key = dealt?.mode === "classic" ? WHY_COPY.keyTurns : dealt?.budget ? WHY_COPY.keyBudget : WHY_COPY.key;
  return {
    ...(together ?? dealtPart(item, viewerId, { Who, who, whose })),
    key,
    stakes: stakesLine(item, viewerId, rules, now, { Who, who, whose }),
  };
}

/**
 * Why a John done together went to the people on it: "Needs 3. You, Sam and
 * Ada were furthest behind of the 4 home." Each place was dealt like a John
 * of its own, to whoever was furthest behind and not on it yet, so the
 * first place weighed everyone home.
 */
function togetherPart(
  places: readonly BoardItem[],
  viewerId: string,
  say: { Who: (id: string) => string; who: (id: string) => string },
): Pick<WhyView, "answer" | "rows"> | null {
  const dealt = places.map((p) => p.dealt);
  if (dealt.some((d) => !d)) return null;
  const tos = dealt.map((d) => d!.to);
  const first = dealt.reduce((a, b) => (b!.weighed.length > a!.weighed.length ? b : a))!;
  const home = first.weighed.length;
  // You first, then in the order they were dealt.
  const ordered = [...tos.filter((id) => id === viewerId), ...tos.filter((id) => id !== viewerId)];
  const names = andList(ordered.map((id, i) => (i === 0 ? say.Who(id) : say.who(id))));
  const one = ordered.length === 1 && ordered[0] !== viewerId;
  const lines = [CREW_COPY.needs(places.length)];
  lines.push(home <= places.length ? CREW_COPY.allHome(names, home) : CREW_COPY.furthest(names, one, home));
  if (first.away.length) {
    const away = first.away.map((id, i) => (i === 0 ? say.Who(id) : say.who(id)));
    lines.push(WHY_COPY.away(andList(away), away.length === 1 && first.away[0] !== viewerId));
  }
  const rows: WhyRow[] =
    first.weighed.length > 1
      ? first.weighed.map((w) => ({
          userId: w.userId,
          name: say.Who(w.userId),
          value: formatBalance(w.standing),
          meta: [tos.includes(w.userId) ? WHY_COPY.dealtIt : null, w.last ? WHY_COPY.hadItLast : null].filter((m) => m !== null).join(", ") || null,
          chosen: tos.includes(w.userId),
        }))
      : [];
  return { answer: lines.join(" "), rows };
}

function dealtPart(
  item: BoardItem,
  viewerId: string,
  say: { Who: (id: string) => string; who: (id: string) => string; whose: (id: string) => string },
): Pick<WhyView, "answer" | "rows"> {
  if (item.flaggedAt) return { answer: WHY_COPY.flag, rows: [] };
  const why = item.dealt;
  if (!why) return { answer: WHY_COPY.unknown, rows: [] };

  const to = why.to;
  const you = to === viewerId;
  const chosen = why.weighed.find((w) => w.userId === to);
  const others = chosen ? why.weighed.filter((w) => w.userId !== to) : [];
  // Passed over though further behind: handed the most extra a week gives (checked first, in the deal).
  const full = others.filter((w) => w.full && w.standing < chosen!.standing);
  // Passed over though as far behind or further: did it last time.
  const nudged = others.filter((w) => !w.full && w.last && w.standing <= chosen!.standing);

  const lines: string[] = [];
  if (why.by === "only") lines.push(WHY_COPY.only(say.Who(to), you));
  else if (why.by === "back") lines.push(WHY_COPY.back(say.Who(to), you));
  else if (why.by === "oneEach") lines.push(WHY_COPY.oneEach(you ? WHY_COPY.yours : say.whose(to)));
  else if (why.by === "mostRoom") lines.push(WHY_COPY.mostRoom(say.who(to)));
  else if (why.by === "turn") lines.push(WHY_COPY.turn(say.whose(to)));
  else if (why.by === "nextInLine") lines.push(WHY_COPY.nextInLine(say.who(to)));
  else if (why.by === "behind") lines.push(nudged.length ? WHY_COPY.nudged(say.who(to)) : WHY_COPY.behind(say.who(to)));
  else if (why.by === "fewer") lines.push(WHY_COPY.fewer(say.who(to)));
  else lines.push(WHY_COPY.draw(say.who(to)));

  /** Starting a sentence: "You and Ben", "Ben and you". */
  const names = (ids: readonly string[]) => andList(ids.map((id, i) => (i === 0 ? say.Who(id) : say.who(id))));
  /** One of them, and not you: "was", "is". */
  const one = (ids: readonly string[]) => ids.length === 1 && ids[0] !== viewerId;
  if (why.waited) lines.push(WHY_COPY.waited(why.waited));
  if (why.stretched) lines.push(WHY_COPY.stretched(say.whose(to)));
  if (why.again) lines.push(WHY_COPY.againWaited);
  if (full.length) lines.push(WHY_COPY.full(names(full.map((w) => w.userId)), one(full.map((w) => w.userId))));
  if (nudged.length && why.by === "behind") {
    const level = nudged.every((w) => w.standing === chosen!.standing);
    lines.push(WHY_COPY.movedOn(names(nudged.map((w) => w.userId)), one(nudged.map((w) => w.userId)), level));
  }
  if (chosen?.last && why.by === "behind" && others.length > 0) lines.push(WHY_COPY.again(say.Who(to), you));
  if (why.away.length) lines.push(WHY_COPY.away(names(why.away), one(why.away)));
  if (why.moved === "taken") lines.push(WHY_COPY.movedTaken(say.who(to), you));
  else if (why.moved === "suits") lines.push(WHY_COPY.movedSuits(say.who(to)));
  else if (why.moved === "away") lines.push(WHY_COPY.movedAway(say.who(to), you));
  else if (why.moved === "gone") lines.push(WHY_COPY.movedGone);
  if (item.userId !== to) lines.push(WHY_COPY.moved(say.who(to), say.who(item.userId)));

  const classic = why.mode === "classic";
  const rows: WhyRow[] =
    why.weighed.length > 1
      ? why.weighed.map((w) => {
          const meta = [
            w.userId === to ? WHY_COPY.dealtIt : null,
            w.last ? WHY_COPY.hadItLast : null,
            w.full ? WHY_COPY.handedMost : null,
            !classic && w.room !== undefined ? WHY_COPY.left(w.room) : null,
          ].filter((m) => m !== null);
          return {
            userId: w.userId,
            name: say.Who(w.userId),
            value: classic && w.place !== undefined ? WHY_COPY.inLine(w.place) : formatBalance(w.standing),
            meta: meta.length ? meta.join(", ") : null,
            chosen: w.userId === to,
          };
        })
      : [];
  return { answer: lines.join(" "), rows };
}

function stakesLine(
  item: BoardItem,
  viewerId: string,
  rules: HouseRules,
  now: Date,
  say: { Who: (id: string) => string; who: (id: string) => string; whose: (id: string) => string },
): string | null {
  const holder = item.userId;
  if (isOpen(item.status)) {
    const missed = WHY_COPY.missedBy(dueInLine(item.closesAt, now, rules.timezone), say.who(holder));
    const opens = coverOpensAt(item.dueAt, rules.coverGraceHours, item.closesAt);
    const cover = opens.getTime() <= now.getTime() ? WHY_COPY.coverNow : WHY_COPY.coverFrom(dueInLine(opens, now, rules.timezone));
    return `${missed} ${cover}`;
  }
  // Disputed: whose work it is waits on the vote.
  if (item.status === "disputed") return null;
  if (item.absentAt) return CREW_COPY.absentCounts(say.Who(holder), say.whose(holder));
  if (item.crew && item.crew.people.length > 1) {
    const crew = item.crew;
    const ids = [...crew.people.filter((c) => c.userId === viewerId), ...crew.people.filter((c) => c.userId !== viewerId)].map((c) => c.userId);
    const names = andList(ids.map((id, i) => (i === 0 ? say.Who(id) : say.who(id))));
    return CREW_COPY.sharedCounts(names, shareLabel(crew.total / crew.people.length));
  }
  if (item.coveredBy) return WHY_COPY.coveredCounts(say.Who(item.coveredBy), say.whose(item.coveredBy));
  if (item.status === "missed") return WHY_COPY.missedCounts(say.who(holder));
  if (item.status === "excused") return WHY_COPY.excusedCounts;
  return WHY_COPY.counts(say.whose(holder));
}
