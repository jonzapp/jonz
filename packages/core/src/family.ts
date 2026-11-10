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

/** The front door's three sentences, by their ids' last part. */
export const DOOR_POINTS = ["list", "share", "stake"] as const;

/** The front door's words for the side picked: the headline, the three sentences and Start. */
export function frontDoorWords(kind: HouseKind, words: Words) {
  return kind === "family"
    ? { headline: words('house.family.door.headline'), points: DOOR_POINTS.map((key) => ({ key, body: words(`house.family.door.points.${key}`) })), start: words('house.family.door.start') }
    : { headline: words('door.front.headline'), points: DOOR_POINTS.map((key) => ({ key, body: words(`door.welcome.points.${key}`) })), start: words('door.welcome.start') };
}

/** Start a house's sign for the kind picked: heading, intro and the button. */
export function newHouseWords(kind: HouseKind, words: Words) {
  return kind === "family"
    ? { title: words('common.title.newFamily'), heading: words('house.family.newHeading'), intro: words('house.family.newIntro'), submit: words('house.family.submit') }
    : { title: words('common.title.newHouse'), heading: words('door.newHouse.heading'), intro: words('door.newHouse.intro'), submit: words('door.welcome.submit') };
}

/** A join link's line under the house's name. */
export function joinLine(kind: HouseKind, people: number, words: Words): string {
  return kind === "family" ? words('house.family.livesHere', { people }) : words('door.join.livesHere', { people });
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
    /** House › Rules' list of who looks after the house. */
    admins: {
      meta: (admins: number, everyone: number) => w("house.adminsList.meta", { admins, everyone }),
      you: (name: string) => w("house.adminsList.you", { name }),
      addBody: w("house.adminsList.addBody"),
      remove: w("house.adminsList.remove"),
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
      makeAdminMeta: w("people.person.makeAdminMeta"),
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
export function passWords(kind: HouseKind, historyWeeks: number, words: Words) {
  const history: PassExtra = { key: "history", title: words('house.pass.history'), meta: words('house.pass.historyMeta', { weeks: historyWeeks }) };
  const p = kind === "family" ? "house.familyPass" : "house.pass";
  return {
    title: words(`${p}.title`),
    sectionNote: words(`${p}.sectionNote`),
    lead: words(`${p}.lead`),
    foundingLead: words(`${p}.foundingLead`),
    includes: words(`${p}.includes`),
    extras: (kind === "family"
      ? [
          { key: "pocket", title: words("house.familyPass.pocket"), meta: words("house.familyPass.pocketMeta") },
          { key: "kids", title: words("house.familyPass.kids"), meta: words("house.familyPass.kidsMeta") },
          { key: "photos", title: words("house.familyPass.photos"), meta: words("house.familyPass.photosMeta") },
          history,
        ]
      : [
          { key: "stake", title: words("house.pass.stake"), meta: words("house.pass.stakeMeta") },
          { key: "table", title: words("house.pass.table"), meta: words("house.pass.tableMeta") },
          { key: "photos", title: words("house.pass.photos"), meta: words("house.pass.photosMeta") },
          history,
        ]) as PassExtra[],
    free: words(`${p}.free`),
    bought: words(`${p}.bought`),
    locked: (feature: string) => words(`${p}.locked`, { feature }),
    unlock: words(`${p}.unlock`),
  };
}
