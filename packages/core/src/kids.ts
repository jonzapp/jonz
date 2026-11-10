import { z } from "zod";

import { wordsFor, type Words } from "./words-for";

/**
 * Kids without a sign-in, family step 4 (docs/specs/family-houses.md): a
 * parent adds a child by name and the year they were born, ticks for them
 * from Today's switcher, and gives each John a youngest age the deal keeps
 * to.
 */

// The server's refusals read the housemates' words for now; each person's own language comes with translation 7.
const SERVER_WORDS = wordsFor("en", "housemates");

/** What POST /api/kids takes. */
export const AddKid = z.object({
  name: z.string().trim().min(1, SERVER_WORDS("people.kids.problems.name")).max(40, SERVER_WORDS("people.kids.problems.name")),
  bornYear: z.number().int(),
});
export type AddKid = z.infer<typeof AddKid>;

/** What POST /api/kids answers: the new kid's id. */
export const AddKidResponse = z.object({ userId: z.uuid() });

/** Kids are 18 or under: the years a parent can give, as add_kid checks them. */
export function bornYearOk(year: number, thisYear: number): boolean {
  return Number.isInteger(year) && year >= thisYear - 18 && year <= thisYear;
}

/** The Add a child form, checked: the kid to add, or what to fix in each field. */
export function checkKid(
  form: { name: string; born: string },
  thisYear: number, words: Words,
): { kid: AddKid; problems?: undefined } | { kid?: undefined; problems: Partial<Record<"name" | "born", string>> } {
  const problems: Partial<Record<"name" | "born", string>> = {};
  const name = form.name.trim();
  if (!name || name.length > 40) problems.name = words('people.kids.problems.name');
  const year = /^\d{4}$/.test(form.born.trim()) ? Number(form.born.trim()) : NaN;
  if (!bornYearOk(year, thisYear)) problems.born = words('people.kids.problems.born');
  return Object.keys(problems).length ? { problems } : { kid: { name, bornYear: year } };
}

/** The editor's Youngest age, from what was typed: a whole age 2 to 18, null when empty, undefined when it's wrong. */
export function parseMinAge(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) return undefined;
  const age = Number(t);
  return age >= 2 && age <= 18 ? age : undefined;
}

/**
 * Whether someone is old enough for a John in the week starting `startsOn`
 * (YYYY-MM-DD): the age they turn that year against its youngest age.
 * Anyone with no year born (a parent, a kid who signs in) or a John with no
 * youngest age is.
 */
export function oldEnough(bornYear: number | null | undefined, minAge: number | null | undefined, startsOn: string): boolean {
  if (bornYear == null || minAge == null) return true;
  return Number(startsOn.slice(0, 4)) - bornYear >= minAge;
}

/**
 * Today's switcher, for a parent in a family with a kid who doesn't sign in:
 * you first, then each of those kids, by name. Empty when there's nobody to
 * switch to.
 */
export function switchChoices(
  members: readonly { userId: string; name: string; role: string; signsIn?: boolean }[],
  me: string,
  family: boolean, words: Words,
): { value: string; label: string }[] {
  const mine = members.find((m) => m.userId === me);
  if (!family || mine?.role !== "admin") return [];
  const kids = members.filter((m) => m.role !== "admin" && m.signsIn === false);
  if (kids.length === 0) return [];
  return [{ value: me, label: words('people.kids.you') }, ...kids.map((k) => ({ value: k.userId, label: k.name.split(" ")[0] }))];
}
