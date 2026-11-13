/**
 * The John sheet's "Why?": why the deal gave a John to whom it did, how it
 * added up, and what slipping would cost, or once it's settled, whose work
 * it counted as. Read from what the deal kept (BoardItem.dealt), so it says
 * what the deal did rather than replaying it.
 */
import type { BoardItem } from "./board";
import { isOpen } from "./board";
import { andNames, shareLabel } from "./crew";
import type { HouseRules } from "./domain";
import { dueInLine, firstName, formatBalance } from "./format";
import { coverOpensAt } from "./outcome";
import type { Viewing } from "./viewing";
import type { Words } from "./words-for";

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


export function johnWhy(
  item: BoardItem,
  { people, viewerId, rules, now, words }: Viewing,
  /** A John done together's places on the board (its job's), to say why the people on it are. */
  places: readonly BoardItem[] = [item],
): WhyView {
  const name = (id: string) => {
    const person = people.find((p) => p.userId === id);
    return person ? firstName(person.name) : words('john.why.someoneGone');
  };
  /** At the start of a sentence: "You", "Ben". */
  const Who = (id: string) => (id === viewerId ? words('john.why.You') : name(id));
  /** Mid-sentence: "you", "Ben". */
  const who = (id: string) => (id === viewerId ? words('john.why.you') : name(id));
  const whose = (id: string) => (id === viewerId ? words('john.why.your') : words('wall.feed.whose', { name: name(id) }));

  const together = places.length > 1 ? togetherPart(places, viewerId, { Who, who }, words) : null;
  const dealt = item.dealt;
  const key = dealt?.mode === "classic" ? words('john.why.keyTurns') : dealt?.budget ? words('john.why.keyBudget') : words('john.why.key');
  return {
    ...(together ?? dealtPart(item, viewerId, { Who, who, whose }, words)),
    key,
    stakes: stakesLine(item, viewerId, rules, now, { Who, who, whose }, words),
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
  say: { Who: (id: string) => string; who: (id: string) => string }, words: Words,
): Pick<WhyView, "answer" | "rows"> | null {
  const dealt = places.map((p) => p.dealt);
  if (dealt.some((d) => !d)) return null;
  const tos = dealt.map((d) => d!.to);
  const first = dealt.reduce((a, b) => (b!.weighed.length > a!.weighed.length ? b : a))!;
  const home = first.weighed.length;
  // You first, then in the order they were dealt.
  const ordered = [...tos.filter((id) => id === viewerId), ...tos.filter((id) => id !== viewerId)];
  const names = andNames(ordered.map((id, i) => (i === 0 ? say.Who(id) : say.who(id))), words);
  const one = ordered.length === 1 && ordered[0] !== viewerId;
  const lines = [words('john.crew.needs', { n: places.length })];
  lines.push(home <= places.length ? words('john.crew.allHome', { names, home }) : words('john.crew.furthest', { names, one, home }));
  if (first.away.length) {
    const away = first.away.map((id, i) => (i === 0 ? say.Who(id) : say.who(id)));
    lines.push(words('john.why.away', { names: andNames(away, words), one: away.length === 1 && first.away[0] !== viewerId }));
  }
  const rows: WhyRow[] =
    first.weighed.length > 1
      ? first.weighed.map((w) => ({
          userId: w.userId,
          name: say.Who(w.userId),
          value: formatBalance(w.standing, words),
          meta: [tos.includes(w.userId) ? words('john.why.dealtIt') : null, w.last ? words('john.why.hadItLast') : null].filter((m) => m !== null).join(", ") || null,
          chosen: tos.includes(w.userId),
        }))
      : [];
  return { answer: lines.join(" "), rows };
}

function dealtPart(
  item: BoardItem,
  viewerId: string,
  say: { Who: (id: string) => string; who: (id: string) => string; whose: (id: string) => string }, words: Words,
): Pick<WhyView, "answer" | "rows"> {
  if (item.flaggedAt) return { answer: words('john.why.flag'), rows: [] };
  const why = item.dealt;
  if (!why) return { answer: words('john.why.unknown'), rows: [] };

  const to = why.to;
  const you = to === viewerId;
  const chosen = why.weighed.find((w) => w.userId === to);
  const others = chosen ? why.weighed.filter((w) => w.userId !== to) : [];
  // Passed over though further behind: handed the most extra a week gives (checked first, in the deal).
  const full = others.filter((w) => w.full && w.standing < chosen!.standing);
  // Passed over though as far behind or further: did it last time.
  const nudged = others.filter((w) => !w.full && w.last && w.standing <= chosen!.standing);

  const lines: string[] = [];
  if (why.by === "only") lines.push(words('john.why.only', { who: say.Who(to), you }));
  else if (why.by === "back") lines.push(words('john.why.back', { who: say.Who(to), you }));
  else if (why.by === "oneEach") lines.push(words('john.why.oneEach', { whose: you ? words('john.why.yours') : say.whose(to) }));
  else if (why.by === "mostRoom") lines.push(words('john.why.mostRoom', { who: say.who(to) }));
  else if (why.by === "turn") lines.push(words('john.why.turn', { whose: say.whose(to) }));
  else if (why.by === "nextInLine") lines.push(words('john.why.nextInLine', { who: say.who(to) }));
  else if (why.by === "behind") lines.push(nudged.length ? words('john.why.nudged', { who: say.who(to) }) : words('john.why.behind', { who: say.who(to) }));
  else if (why.by === "fewer") lines.push(words('john.why.fewer', { who: say.who(to) }));
  else lines.push(words('john.why.draw', { who: say.who(to) }));

  /** Starting a sentence: "You and Ben", "Ben and you". */
  const names = (ids: readonly string[]) => andNames(ids.map((id, i) => (i === 0 ? say.Who(id) : say.who(id))), words);
  /** One of them, and not you: "was", "is". */
  const one = (ids: readonly string[]) => ids.length === 1 && ids[0] !== viewerId;
  if (why.waited) lines.push(words('john.why.waited', { weeks: why.waited }));
  if (why.stretched) lines.push(words('john.why.stretched', { whose: say.whose(to) }));
  if (why.again) lines.push(words('john.why.againWaited'));
  if (full.length) lines.push(words('john.why.full', { names: names(full.map((w) => w.userId)), one: one(full.map((w) => w.userId)) }));
  if (nudged.length && why.by === "behind") {
    const level = nudged.every((w) => w.standing === chosen!.standing);
    lines.push(words('john.why.movedOn', { names: names(nudged.map((w) => w.userId)), one: one(nudged.map((w) => w.userId)), level }));
  }
  if (chosen?.last && why.by === "behind" && others.length > 0) lines.push(words('john.why.again', { who: say.Who(to), you }));
  if (why.away.length) lines.push(words('john.why.away', { names: names(why.away), one: one(why.away) }));
  if (why.moved === "taken") lines.push(words('john.why.movedTaken', { who: say.who(to), you }));
  else if (why.moved === "suits") lines.push(words('john.why.movedSuits', { who: say.who(to) }));
  else if (why.moved === "away") lines.push(words('john.why.movedAway', { who: say.who(to), you }));
  else if (why.moved === "gone") lines.push(words('john.why.movedGone'));
  if (item.userId !== to) lines.push(words('john.why.moved', { dealtTo: say.who(to), holder: say.who(item.userId) }));

  const classic = why.mode === "classic";
  const rows: WhyRow[] =
    why.weighed.length > 1
      ? why.weighed.map((w) => {
          const meta = [
            w.userId === to ? words('john.why.dealtIt') : null,
            w.last ? words('john.why.hadItLast') : null,
            w.full ? words('john.why.handedMost') : null,
            !classic && w.room !== undefined ? words('john.why.left', { room: Math.max(0, Math.round(w.room * 10) / 10) }) : null,
          ].filter((m) => m !== null);
          return {
            userId: w.userId,
            name: say.Who(w.userId),
            value: classic && w.place !== undefined ? words('john.why.inLine', { place: w.place }) : formatBalance(w.standing, words),
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
  say: { Who: (id: string) => string; who: (id: string) => string; whose: (id: string) => string }, words: Words,
): string | null {
  const holder = item.userId;
  if (isOpen(item.status)) {
    const missed = words('john.why.missedBy', { when: dueInLine(item.closesAt, now, rules.timezone, words), holder: say.who(holder) });
    const opens = coverOpensAt(item.dueAt, rules.coverGraceHours, item.closesAt);
    const cover = opens.getTime() <= now.getTime() ? words('john.why.coverNow') : words('john.why.coverFrom', { when: dueInLine(opens, now, rules.timezone, words) });
    return `${missed} ${cover}`;
  }
  // Disputed: whose work it is waits on the vote.
  if (item.status === "disputed") return null;
  if (item.absentAt) return words('john.crew.absentCounts', { holder: say.Who(holder), whose: say.whose(holder) });
  if (item.crew && item.crew.people.length > 1) {
    const crew = item.crew;
    const ids = [...crew.people.filter((c) => c.userId === viewerId), ...crew.people.filter((c) => c.userId !== viewerId)].map((c) => c.userId);
    const names = andNames(ids.map((id, i) => (i === 0 ? say.Who(id) : say.who(id))), words);
    return words('john.crew.sharedCounts', { names, each: shareLabel(crew.total / crew.people.length, words) });
  }
  if (item.coveredBy) return words('john.why.coveredCounts', { who: say.Who(item.coveredBy), whose: say.whose(item.coveredBy) });
  if (item.status === "missed") return words('john.why.missedCounts', { holder: say.who(holder) });
  if (item.status === "excused") return words('john.why.excusedCounts');
  return words('john.why.counts', { whose: say.whose(holder) });
}
