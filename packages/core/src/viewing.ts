import type { HouseRules } from "./domain";
import type { Words } from "./words-for";

/**
 * Who is looking and when: the house's people and rules, the viewer, the
 * time, the zone they read times in and the words in their language. What a
 * John's lines (when it's due, who ticked it, why it's theirs) are all
 * written from. `zone` is the reader's own (their phone's, when its clock
 * differs from the house's) or the house's (`rules.timezone`); the house's
 * weeks and months are always read in `rules.timezone`.
 */
export type Viewing = {
  people: readonly { userId: string; name: string }[];
  viewerId: string;
  rules: HouseRules;
  now: Date;
  zone: string;
  words: Words;
};
