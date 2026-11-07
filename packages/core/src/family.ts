import {
  ADMINS_COPY,
  FAMILY_COPY,
  FRONT_DOOR,
  FRONT_DOOR_COPY,
  HOUSE_LOWER_COPY,
  JOIN_COPY,
  NEW_HOUSE_COPY,
  PARENTS_COPY,
  PAGE_TITLE,
  PERSON_COPY,
  ROLE_WORDS,
} from "./copy";
import type { HouseKind } from "./domain";

/**
 * Whether anyone can pick Family yet. The family version lands one step at a
 * time (docs/specs/family-houses.md); until its last step the front door and
 * Start a house only offer it to a link that asks (`/house/new?kind=family`),
 * so nobody signs up for pocket money before it is built.
 */
export const FAMILY_OPEN = false;

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
 * same (members.role is still admin or member).
 */
export function roleCopy(kind: HouseKind) {
  const w = ROLE_WORDS[kind];
  const family = kind === "family";
  return {
    words: w,
    /** House › Rules' list of who looks after the house. */
    admins: family ? PARENTS_COPY : ADMINS_COPY,
    /** Under a person's name: "Parent", or "You, kid" on your own page. */
    sub: (admin: boolean, you: boolean) =>
      family ? (you ? `You, ${admin ? w.admin : w.member}` : admin ? w.Admin : w.Member) : PERSON_COPY.sub(admin, you),
    /** A person page's role section. */
    person: family
      ? {
          section: w.Admin,
          makeAdmin: PARENTS_COPY.makeParent,
          makeAdminMeta: PERSON_COPY.makeAdminMeta,
          makeMember: PARENTS_COPY.makeKid,
          makeMemberMeta: PARENTS_COPY.makeKidMeta,
        }
      : {
          section: PERSON_COPY.admin,
          makeAdmin: PERSON_COPY.makeAdmin,
          makeAdminMeta: PERSON_COPY.makeAdminMeta,
          makeMember: PERSON_COPY.makeHousemate,
          makeMemberMeta: PERSON_COPY.makeHousemateMeta,
        },
    /** Under your name on the You page: "The Parks, parent". */
    youIn: (house: string, admin: boolean) =>
      family ? `${house}, ${admin ? w.admin : w.member}` : HOUSE_LOWER_COPY.youIn(house, admin),
    lastAdmin: family ? PARENTS_COPY.lastParent : HOUSE_LOWER_COPY.lastAdmin,
    handOver: (name: string) => (family ? PARENTS_COPY.handOver(name) : HOUSE_LOWER_COPY.handOver(name)),
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
