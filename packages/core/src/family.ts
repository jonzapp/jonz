import {
  ADMINS_COPY,
  FAMILY_COPY,
  FAMILY_PASS_COPY,
  FRONT_DOOR,
  FRONT_DOOR_COPY,
  JOIN_COPY,
  NEW_HOUSE_COPY,
  PAGE_TITLE,
  PASS_COPY,
  PERSON_COPY,
  ROLE_WORDS,
} from "./copy";
import type { HouseKind } from "./domain";
import type { Words } from "./words-for";

/**
 * Whether anyone can pick Family. The family version landed one step at a
 * time (docs/specs/family-houses.md); until its last step (step 5) the front
 * door and Start a house only offered it to a link that asked
 * (`/house/new?kind=family`). Now the switch shows to everyone.
 */
export const FAMILY_OPEN = true;

/** A kind from a link or storage, or null when it names none. */
export function kindParam(value: string | string[] | null | undefined): HouseKind | null {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "family" || one === "housemates" ? one : null;
}

/** The front door's words for the side picked: the headline, the three sentences and Start. */
export function frontDoorWords(kind: HouseKind) {
  return kind === "family"
    ? { headline: FAMILY_COPY.door.headline, points: FAMILY_COPY.door.points, start: FAMILY_COPY.door.start }
    : { headline: FRONT_DOOR.headline, points: FRONT_DOOR_COPY.points, start: FRONT_DOOR_COPY.start };
}

/** Start a house's sign for the kind picked: heading, intro and the button. */
export function newHouseWords(kind: HouseKind) {
  return kind === "family"
    ? { title: PAGE_TITLE.newFamily, heading: FAMILY_COPY.newHeading, intro: FAMILY_COPY.newIntro, submit: FAMILY_COPY.submit }
    : { title: PAGE_TITLE.newHouse, heading: NEW_HOUSE_COPY.heading, intro: NEW_HOUSE_COPY.intro, submit: FRONT_DOOR_COPY.submit };
}

/** A join link's line under the house's name. */
export function joinLine(kind: HouseKind, people: number): string {
  return kind === "family" ? FAMILY_COPY.livesHere(people) : JOIN_COPY.livesHere(people);
}

/**
 * Everything that names the two roles, for the kind of house: in a family an
 * admin is a parent and everyone else a kid. The roles themselves are the
 * same (members.role is still admin or member). The lines live in the words
 * files (locales/en/house.json, people.json); this gathers the ones a person's
 * page, Rules and the You page use.
 */
export function roleCopy(w: Words) {
  const role = (admin: boolean) => ({ role: admin ? "admin" : "member" });
  return {
    words: ROLE_WORDS[w.kind],
    /** House › Rules' list of who looks after the house. */
    admins: {
      ...ADMINS_COPY,
      title: w("house.admins.title"),
      note: w("house.admins.note"),
      add: w("house.admins.add"),
      everyoneIs: w("house.admins.everyoneIs"),
      make: (name: string) => w("house.admins.make", { name }),
      removeLabel: (name: string) => w("house.admins.remove", { name }),
      onlyAdmin: w("house.admins.onlyAdmin"),
    },
    /** Under a person's name: "Parent", or "You, kid" on your own page. */
    sub: (admin: boolean, you: boolean) => w(you ? "people.person.roleYou" : "people.person.role", role(admin)),
    /** A person page's role section. */
    person: {
      section: w("people.person.role", role(true)),
      makeAdmin: w("people.person.makeAdmin"),
      makeAdminMeta: PERSON_COPY.makeAdminMeta,
      makeMember: w("people.person.makeMember"),
      makeMemberMeta: w("people.person.makeMemberMeta"),
    },
    /** Under your name on the You page: "The Parks, parent". */
    youIn: (house: string, admin: boolean) => w("house.leave.youIn", { house, ...role(admin) }),
    lastAdmin: w("house.leave.lastAdmin"),
    handOver: (name: string) => w("house.leave.handOver", { name }),
  };
}

/**
 * What a family hides from the housemates' app: the Stake, with its money
 * figures, forfeits and settling up, and the housemate check's vote (a
 * kid's tick waits for a parent's OK instead, with no window to dispute
 * in). Housemates see everything.
 */
export function familyHides(kind: HouseKind): { stake: boolean; vote: boolean } {
  const family = kind === "family";
  return { stake: family, vote: family };
}

/** One extra the Pass brings, as its page lists it. */
export interface PassExtra {
  key: "stake" | "table" | "photos" | "history" | "pocket" | "kids";
  title: string;
  meta: string;
}

/**
 * The Pass's words for the kind of house: in a family it is the Family Pass
 * (the same Pass and price), with pocket money, kid profiles and photos to
 * check as its extras. `historyWeeks` is how far back a house without it sees.
 */
export function passWords(kind: HouseKind, historyWeeks: number) {
  const history: PassExtra = { key: "history", title: PASS_COPY.history, meta: PASS_COPY.historyMeta(historyWeeks) };
  if (kind === "family") {
    const f = FAMILY_PASS_COPY;
    return {
      title: f.title,
      sectionNote: f.sectionNote,
      lead: f.lead,
      foundingLead: f.foundingLead,
      includes: f.includes,
      extras: [
        { key: "pocket", title: f.pocket, meta: f.pocketMeta },
        { key: "kids", title: f.kids, meta: f.kidsMeta },
        { key: "photos", title: f.photos, meta: f.photosMeta },
        history,
      ] as PassExtra[],
      free: f.free,
      bought: f.bought,
      locked: f.locked,
      unlock: f.unlock,
    };
  }
  const p = PASS_COPY;
  return {
    title: p.title,
    sectionNote: p.sectionNote,
    lead: p.lead,
    foundingLead: p.foundingLead,
    includes: p.includes,
    extras: [
      { key: "stake", title: p.stake, meta: p.stakeMeta },
      { key: "table", title: p.table, meta: p.tableMeta },
      { key: "photos", title: p.photos, meta: p.photosMeta },
      history,
    ] as PassExtra[],
    free: p.free,
    bought: p.bought,
    locked: p.locked,
    unlock: p.unlock,
  };
}
