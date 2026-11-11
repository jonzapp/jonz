import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

import { EN, type WordId } from "./locales";

/** Each plain letter's look-alike with an accent, so the test language still reads as English. */
const ACCENTED: Record<string, string> = {
  a: "á", b: "ƀ", c: "ç", d: "đ", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "í", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ",
  n: "ñ", o: "ó", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "ú", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Đ", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Í", J: "Ĵ", K: "Ķ", L: "Ļ", M: "Ṁ",
  N: "Ñ", O: "Ó", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Ú", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

/** A line's words with every letter accented. Gaps, counts and the line's shape stay as they are. */
function accent(elements: MessageFormatElement[]): MessageFormatElement[] {
  return elements.map((e) => {
    if (e.type === TYPE.literal) return { ...e, value: e.value.replace(/[A-Za-z]/g, (c) => ACCENTED[c] ?? c) };
    if (e.type === TYPE.select || e.type === TYPE.plural) {
      const options = Object.fromEntries(Object.entries(e.options).map(([k, o]) => [k, { ...o, value: accent(o.value) }]));
      return { ...e, options };
    }
    if (e.type === TYPE.tag) return { ...e, children: accent(e.children) };
    return e;
  });
}

/**
 * The test language (en-XA): every English line with its letters accented
 * and held in brackets, `[Ţíçķ íţ óƒƒ]`. Words that come from the words
 * files read like that; anything still written into a screen reads plain,
 * and a line cut short loses its closing bracket.
 */
export function pseudoLine(message: string): MessageFormatElement[] {
  return [
    { type: TYPE.literal, value: "[" },
    ...accent(parse(message)),
    { type: TYPE.literal, value: "]" },
  ];
}

let made: Record<WordId, MessageFormatElement[]> | null = null;

/** Every line in the test language, made once, the first time someone reads it. */
export function pseudoMessages(): Record<WordId, MessageFormatElement[]> {
  made ??= Object.fromEntries(Object.entries(EN).map(([id, line]) => [id, pseudoLine(line)])) as Record<WordId, MessageFormatElement[]>;
  return made;
}
