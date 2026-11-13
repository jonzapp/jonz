import type { HouseRules } from "./domain";
import type { Words } from "./words-for";

/**
 * Who is looking and when: the house's people and rules, the viewer, the
 * time, and the words in their language. What a John's lines (when it's
 * due, who ticked it, why it's theirs) are all written from.
 */
export type Viewing = {
  people: readonly { userId: string; name: string }[];
  viewerId: string;
  rules: HouseRules;
  now: Date;
  words: Words;
};
