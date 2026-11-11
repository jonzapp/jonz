import type { Currency } from "./domain";
import type { Words } from "./words-for";

/**
 * Money is whole minor units everywhere (pence, cents). It becomes a
 * decimal only here, at the moment it is printed.
 */

/** How an amount reads in English: as its currency's own country writes it, "$2.50" in Canada rather than "CA$2.50". */
const ENGLISH: Record<Currency, string> = {
  GBP: "en-GB",
  CAD: "en-CA",
  USD: "en-US",
  EUR: "en-IE",
};

/**
 * An amount in the reader's language. English writes it as the currency's own
 * country does ("$2.50" in Canada); another language writes it its own way
 * ("2,50 €"). Always the plain sign ("£", never "£GB"): a house has one
 * currency, so it can't be mistaken.
 */
export function formatMoney(minor: number, currency: Currency, words: Words): string {
  return new Intl.NumberFormat(words.locale.startsWith("en") ? ENGLISH[currency] : words.locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** "+£2", "−£3.50" — the sign is the point, so it is always shown. */
export function formatSigned(minor: number, currency: Currency, words: Words): string {
  if (minor === 0) return formatMoney(0, currency, words);
  const body = formatMoney(Math.abs(minor), currency, words);
  return minor > 0 ? `+${body}` : `−${body}`;
}

/** Parse what someone typed into a money field ("2", "2.5", "£2.50") into minor units. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** An amount as a money field starts out: "20", or "2.50" when there are pence. The inverse of parseMoney. */
export function moneyInput(minor: number): string {
  return (minor / 100).toFixed(minor % 100 ? 2 : 0);
}

const EURO_ZONE = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

/** How each currency is marked before an amount: "£ GBP" in a picker. */
export const CURRENCY_SYMBOL: Record<Currency, string> = { GBP: "£", CAD: "$", USD: "$", EUR: "€" };

/**
 * A house's currency defaults to wherever it was set up (Vercel's
 * `x-vercel-ip-country` header). Anywhere else starts in pounds, and the
 * house can change it in settings.
 */
export function currencyForCountry(country: string | null | undefined): Currency {
  const c = country?.toUpperCase();
  if (c === "GB" || c === "IM" || c === "JE" || c === "GG") return "GBP";
  if (c === "CA") return "CAD";
  if (c === "US") return "USD";
  if (c && EURO_ZONE.has(c)) return "EUR";
  return "GBP";
}
