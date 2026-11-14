import { tzOffset } from "@date-fns/tz";

import { dateIn } from "./format";
import type { Words } from "./words-for";
import { ZONE_COUNTRY } from "./zone-countries";

/**
 * Time zones as people read them (docs/specs/time-zones.md). A house keeps
 * one zone (`houses.timezone`, an IANA name such as Europe/London): its weeks,
 * days and due times are set in it. Each person reads times in their own
 * phone's zone, so someone away from home sees the time on their own clock.
 * Pure: the caller passes the moment (`at`) every offset is read at, so a
 * zone that changes its clocks reads right on either side of the change.
 */

/** The zone with no clock changes, offered beside the places. */
export const UTC = "UTC";

/** Where a zone is, as people say it: "London" for Europe/London, "Buenos Aires" for America/Argentina/Buenos_Aires. */
export function zoneCity(zone: string): string {
  const last = zone.split("/").filter(Boolean).pop() ?? zone;
  return last.replaceAll("_", " ");
}

const countryNames = new Map<string, Intl.DisplayNames | null>();

/** The names of countries in a language, or null on a phone that hasn't got them (Intl.DisplayNames). */
function countryNamesIn(locale: string): Intl.DisplayNames | null {
  if (!countryNames.has(locale)) {
    countryNames.set(locale, typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([locale], { type: "region" }) : null);
  }
  return countryNames.get(locale) ?? null;
}

/** The zone's country in the reader's language ("Canada", "Royaume-Uni"), or null where it has none or the phone can't name it. */
export function zoneCountry(zone: string, words: Words): string | null {
  const code = ZONE_COUNTRY[zone];
  return code ? (countryNamesIn(words.intl.locale)?.of(code) ?? null) : null;
}

/** "Regina, Canada"; "UTC"; the city alone where there's no country to name. */
export function zonePlace(zone: string, words: Words): string {
  const country = zoneCountry(zone, words);
  return country ? words("common.zone.place", { city: zoneCity(zone), country }) : zoneCity(zone);
}

/** How far ahead of UTC a zone's clocks are at `at`, in minutes: −360 for Regina, 330 for Kolkata. */
export function utcOffset(zone: string, at: Date): number {
  return tzOffset(zone, at);
}

/** "UTC−6", "UTC+5:30", "UTC+0": how a zone's clock differs from UTC. */
export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const whole = Math.abs(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** "UTC+0, 01:22 there now": a zone's offset and its clock, as a row says it under the zone's name. */
export function zoneClock(zone: string, at: Date, words: Words): string {
  return words("common.zone.clock", { offset: offsetLabel(utcOffset(zone, at)), time: dateIn(at, "time", zone, words) });
}

/** Whether two zones' clocks say a different time at `at`: only then is there anything to change. */
export function clocksDiffer(one: string, other: string, at: Date): boolean {
  return utcOffset(one, at) !== utcOffset(other, at);
}

/**
 * "In house time: London, 8 hours ahead of you.": said where a time or a day
 * is set in the house's zone (a John's due time, booking time away, moving
 * out), and only when the reader's clock says another time at `at`; null when
 * the two clocks agree.
 */
export function houseTimeNote({ house, phone }: { house: string; phone: string }, at: Date, words: Words): string | null {
  const minutes = utcOffset(house, at) - utcOffset(phone, at);
  if (minutes === 0) return null;
  const hours = Math.abs(minutes) / 60;
  return words(minutes > 0 ? "common.zone.houseAhead" : "common.zone.houseBehind", { city: zoneCity(house), hours });
}

/** One zone in the house's list: its IANA name, what people read, and its offset now. */
export interface ZoneChoice {
  zone: string;
  city: string;
  country: string | null;
  offset: number;
}

/**
 * The zones a house can pick, A to Z by city: those the database knows
 * (`known`, from public.time_zones()) that are a place people live (tzdata's
 * zone.tab) or UTC. Old spellings the database also knows (US/Central,
 * Asia/Calcutta) are left out, except `keep`, the zone the house has now.
 * Each offset is the one at `at`.
 */
export function zoneChoices(known: readonly string[], { at, keep }: { at: Date; keep?: string }, words: Words): ZoneChoice[] {
  return known
    .filter((zone) => zone in ZONE_COUNTRY || zone === UTC || zone === keep)
    .map((zone) => ({ zone, city: zoneCity(zone), country: zoneCountry(zone, words), offset: utcOffset(zone, at) }))
    .sort((a, b) => a.city.localeCompare(b.city, words.language) || a.zone.localeCompare(b.zone));
}

/** Lower case with the accents taken off, so "sao" finds São Paulo and "cote" Côte d'Ivoire. */
function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * The choices a search finds: each word typed must start a word of the
 * city, the country, the zone's own name or its country's code, so "canada"
 * finds every Canadian zone and "new y" finds New York.
 */
export function findZones(choices: readonly ZoneChoice[], query: string): ZoneChoice[] {
  const asked = plain(query).split(/[\s,/_-]+/).filter(Boolean);
  if (asked.length === 0) return [...choices];
  return choices.filter((choice) => {
    const said = plain([choice.city, choice.country ?? "", choice.zone, ZONE_COUNTRY[choice.zone] ?? ""].join(" ")).split(/[\s,/_'’()-]+/);
    return asked.every((word) => said.some((part) => part.startsWith(word)));
  });
}
