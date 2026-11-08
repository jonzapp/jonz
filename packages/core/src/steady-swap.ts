/**
 * Asking to swap a John you'd rather not, on Today: which housemate would
 * rather do it and which of theirs it could swap for, an ask you've made
 * that's still waiting, and an ask made to you. The database decides
 * whether an ask may be made or taken (offer_swap, answer_swap); this
 * decides what Today offers. Pure.
 */
import type { BoardItem } from "./board";
import { STEADY_COPY } from "./copy";
import { firstName, pointsLabel } from "./format";
import type { MyPrefs } from "./steady-prefs";

/** An open ask, as read (swap_offers): `mine` is the asker's John, `theirs` the one it would swap for. */
export interface SwapOfferRow {
  id: string;
  mine: string;
  theirs: string;
  asked_by: string;
  asked_user_id: string;
  expires_at: string;
}

type Swappable = Pick<BoardItem, "id" | "johnId" | "userId" | "name" | "points" | "status" | "flaggedAt" | "dueAt" | "carried"> &
  Partial<Pick<BoardItem, "jobId">>;

/** Still to do this week, by one person, and not a flag: the Johns an ask can swap. */
function swappable(item: Swappable): boolean {
  return (item.status === "upcoming" || item.status === "due-soon") && !item.flaggedAt && !item.jobId && !item.carried;
}

export type SwapAsk<I extends Swappable> =
  | {
      kind: "suggest";
      mine: I;
      theirs: I;
      withUserId: string;
      /** "Ada would rather do it". */
      title: string;
      /** "Swap it for Ada’s Kitchen, 2 pts". */
      meta: string;
      /** "Ask Ada". */
      button: string;
      /** "If Ada says no or doesn’t answer by tonight, Garbage stays yours." */
      note: string;
    }
  | { kind: "asked"; mine: I; withUserId: string; note: string };

/**
 * For your soonest John you'd rather not: an ask you've made that's still
 * waiting, or else a housemate who'd rather do it and the John of theirs
 * it could swap for (the nearest in points, then the soonest due, never one
 * you'd rather not either). Null when there's none.
 */
export function swapAsk<I extends Swappable>(args: {
  items: readonly I[];
  viewerId: string;
  members: readonly { userId: string; name: string; prefs: MyPrefs }[];
  offers: readonly SwapOfferRow[];
  now: Date;
}): SwapAsk<I> | null {
  const { items, viewerId, members, now } = args;
  const me = members.find((m) => m.userId === viewerId);
  if (!me) return null;
  const nameOf = (id: string) => firstName(members.find((m) => m.userId === id)?.name ?? "") || STEADY_COPY.someone;
  const open = args.offers.filter((o) => Date.parse(o.expires_at) > now.getTime());
  const mine = items
    .filter((i) => i.userId === viewerId && i.johnId && me.prefs.rather[i.johnId] === -1 && swappable(i))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  for (const item of mine) {
    const asked = open.find((o) => o.asked_by === viewerId && o.mine === item.id);
    if (asked) return { kind: "asked", mine: item, withUserId: asked.asked_user_id, note: STEADY_COPY.asked(nameOf(asked.asked_user_id)) };
    const keen = new Set(members.filter((m) => m.userId !== viewerId && m.prefs.rather[item.johnId!] === 1).map((m) => m.userId));
    const theirs = items
      .filter((i) => keen.has(i.userId) && swappable(i) && !(i.johnId && me.prefs.rather[i.johnId] === -1))
      .sort((a, b) => Math.abs(a.points - item.points) - Math.abs(b.points - item.points) || a.dueAt.getTime() - b.dueAt.getTime())[0];
    if (!theirs) continue;
    const name = nameOf(theirs.userId);
    return {
      kind: "suggest",
      mine: item,
      theirs,
      withUserId: theirs.userId,
      title: STEADY_COPY.ratherDoIt(name),
      meta: STEADY_COPY.swapFor(name, theirs.name, pointsLabel(theirs.points)),
      button: STEADY_COPY.ask(name),
      note: STEADY_COPY.askNote(name, item.name),
    };
  }
  return null;
}

export interface SwapOfferToYou<I> {
  id: string;
  fromUserId: string;
  /** Their John, which you'd rather do, and yours it would swap for. */
  theirs: I;
  yours: I;
  /** "Glyn asks to swap". */
  title: string;
  /** "Your Kitchen for their Garbage, 1 pt. You’d rather do Garbage." */
  body: string;
}

/** Asks made to you that are still open, with both Johns still to do and in the same hands. */
export function swapOffersToYou<I extends Swappable>(args: {
  items: readonly I[];
  viewerId: string;
  members: readonly { userId: string; name: string }[];
  offers: readonly SwapOfferRow[];
  now: Date;
}): SwapOfferToYou<I>[] {
  const byId = new Map(args.items.map((i) => [i.id, i]));
  const nameOf = (id: string) => firstName(args.members.find((m) => m.userId === id)?.name ?? "") || STEADY_COPY.someone;
  return args.offers.flatMap((o) => {
    const theirs = byId.get(o.mine);
    const yours = byId.get(o.theirs);
    if (o.asked_user_id !== args.viewerId || Date.parse(o.expires_at) <= args.now.getTime()) return [];
    if (!theirs || !yours || theirs.userId !== o.asked_by || yours.userId !== args.viewerId || !swappable(theirs) || !swappable(yours)) return [];
    return [
      {
        id: o.id,
        fromUserId: o.asked_by,
        theirs,
        yours,
        title: STEADY_COPY.offerTitle(nameOf(o.asked_by)),
        body: STEADY_COPY.offerBody(theirs.name, yours.name, pointsLabel(theirs.points)),
      },
    ];
  });
}
