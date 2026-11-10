import { describe, expect, it } from "vitest";

import {
  applySuggestion,
  AUDIT_FACETS,
  AUDIT_WHAT,
  AUDIT_WHO,
  auditLikeThis,
  DELETION_FACETS,
  DELETION_WHEN,
  NOTICE_FACETS,
  noticeSearchFilter,
  facetChoices,
  listAsk,
  dropTag,
  listSuggestions,
  listTags,
  parseMoment,
  auditSearchFilter,
  listCount,
  listQueryFromParams,
  listQueryIsSet,
  listQueryToParams,
  listTime,
  listWindow,
} from "./admin-list";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const NOW = new Date("2026-10-30T16:44:00Z");
const ZONE = "Europe/London";
const AUDIT = { who: ["anyone", "you", "owners", "people", "jonz"], what: ["anything", "notices", "accounts"] };

describe("a busy list's window", () => {
  it("reads the last hour, 7 and 30 days back from now", () => {
    expect(listWindow({ when: "hour", from: null }, NOW, ZONE)).toEqual({ after: "2026-10-30T15:44:00.000Z", before: null });
    expect(listWindow({ when: "week", from: null }, NOW, ZONE).after).toBe("2026-10-23T16:44:00.000Z");
    expect(listWindow({ when: "month", from: null }, NOW, ZONE).after).toBe("2026-09-30T16:44:00.000Z");
  });

  it("starts Today at midnight where you are, not in UTC", () => {
    expect(listWindow({ when: "today", from: null }, NOW, ZONE).after).toBe("2026-10-30T00:00:00.000Z");
    expect(listWindow({ when: "today", from: null }, NOW, "America/Vancouver").after).toBe("2026-10-30T07:00:00.000Z");
  });

  it("has no limit for Any time", () => {
    expect(listWindow({ when: "any", from: null }, NOW, ZONE)).toEqual({ after: null, before: null });
  });

  it("starts from a moment and reads back from it, past the day it's on", () => {
    expect(listWindow({ when: "today", from: "2026-10-29T23:30:00.000Z" }, NOW, ZONE)).toEqual({
      after: null,
      before: "2026-10-29T23:30:00.000Z",
    });
  });
});

describe("a row's time, with no day headings", () => {
  it("is the time with seconds today", () => {
    expect(listTime("2026-10-30T16:41:07Z", NOW, ZONE)).toBe("16:41:07");
  });

  it("drops the seconds where they won't fit", () => {
    expect(listTime("2026-10-30T16:41:07Z", NOW, ZONE, false)).toBe("16:41");
  });

  it("carries the date before today", () => {
    expect(listTime("2026-10-29T23:58:12Z", NOW, ZONE)).toBe("Thu 29 Oct, 23:58");
  });

  it("decides today in your zone", () => {
    // 05:00 UTC on the 30th is still the 29th in Vancouver.
    expect(listTime("2026-10-30T05:00:00Z", NOW, "America/Vancouver")).toBe("Thu 29 Oct, 22:00");
  });
});

describe("a busy list's address", () => {
  it("reads what the page offers and keeps it", () => {
    const query = listQueryFromParams({ q: "elm", who: "you", what: "notices", when: "today" }, AUDIT);
    expect(query).toEqual({ q: "elm", picks: { who: "you", what: "notices" }, when: "today", from: null });
    expect(listQueryToParams(query)).toEqual({ q: "elm", who: "you", what: "notices", when: "today" });
  });

  it("falls back to the first choice for anything it doesn't offer, so an old link still opens", () => {
    const query = listQueryFromParams({ who: "everyone", what: ["accounts", "x"], when: "fortnight", from: "soon" }, AUDIT);
    expect(query).toEqual({ q: "", picks: { what: "accounts" }, when: "any", from: null });
  });

  it("keeps a plain list's address plain", () => {
    const query = listQueryFromParams({}, AUDIT, "today");
    expect(listQueryToParams(query, "today")).toEqual({});
    expect(listQueryIsSet(query, "today")).toBe(false);
    expect(listQueryIsSet({ ...query, q: "  " }, "today")).toBe(false);
    expect(listQueryIsSet({ ...query, when: "week" }, "today")).toBe(true);
  });

  it("writes a moment instead of When when the list starts from one", () => {
    const query = listQueryFromParams({ from: "2026-10-29T23:30:00Z", when: "week" }, AUDIT);
    expect(listQueryToParams(query)).toEqual({ from: "2026-10-29T23:30:00.000Z" });
  });

  it("caps a pasted search at 200 letters", () => {
    expect(listQueryFromParams({ q: "x".repeat(500) }, AUDIT).q).toHaveLength(200);
  });

  it("keeps no filter for a first choice, which is no filter at all", () => {
    expect(listQueryFromParams({ who: "anyone", what: "notices" }, AUDIT).picks).toEqual({ what: "notices" });
  });

  it("reads the audit log's filters from the search box's list of them", () => {
    expect(facetChoices(AUDIT_FACETS)).toEqual({ who: AUDIT_WHO, what: AUDIT_WHAT });
  });
});

describe("what a busy list's reads are asked", () => {
  it("fixes When's window at the moment it was asked, and trims the words", () => {
    const query = listQueryFromParams({ q: " elm ", who: "you", when: "hour" }, AUDIT);
    expect(listAsk(query, NOW, ZONE)).toEqual({ q: "elm", picks: { who: "you" }, after: "2026-10-30T15:44:00.000Z", before: null });
  });
});

describe("a busy list's count", () => {
  it("is exact up to ten thousand and rounded past it", () => {
    expect(listCount(2481, true)).toBe("2,481");
    expect(listCount(9999, false)).toBe("9,999");
    expect(listCount(48_213, false)).toBe("about 48,000");
    expect(listCount(48_213, true)).toBe("48,213");
  });
});

describe("the audit log's search", () => {
  it("finds an entry by its number, with or without #", () => {
    expect(auditSearchFilter("418213")).toBe('id.eq.418213,target_id.ilike."418213*"');
    expect(auditSearchFilter(" #42 ")).toBe('id.eq.42,target_id.ilike."42*"');
  });

  it("finds words in an account id, a notice's title or a reason", () => {
    expect(auditSearchFilter("jonz is slow")).toBe(
      'target_id.ilike."jonz is slow*",reason.ilike."*jonz is slow*",after->>title.ilike."*jonz is slow*",before->>title.ilike."*jonz is slow*"',
    );
  });

  it("drops anything that could change the filter itself", () => {
    expect(auditSearchFilter('a"),id.gt.(0')).toBe(
      'target_id.ilike."a id.gt. 0*",reason.ilike."*a id.gt. 0*",after->>title.ilike."*a id.gt. 0*",before->>title.ilike."*a id.gt. 0*"',
    );
    expect(auditSearchFilter("100% * _x")).toContain('"*100 _x*"');
  });

  it("searches nothing for nothing", () => {
    expect(auditSearchFilter("   ")).toBeNull();
    expect(auditSearchFilter("()*,")).toBeNull();
  });
});

describe("Show more like this, on an entry", () => {
  const at = "2026-10-30T16:41:07.000Z";

  it("offers everything by the same Who, of the same What, and around its moment", () => {
    expect(auditLikeThis({ actor: "owner-1", action: "notice.save", at }, "owner-1", words)).toEqual([
      { label: "Everything you did", meta: "Who: You", params: { who: "you" } },
      { label: "Every entry about notices", meta: "What: Notices", params: { what: "notices" } },
      { label: "Around this time", meta: "The list from five minutes after it, going back", params: { from: "2026-10-30T16:46:07.000Z" } },
    ]);
  });

  it("names who did it as the drop-down does", () => {
    expect(auditLikeThis({ actor: null, action: "account.delete_done", at }, "owner-1", words)[0].params).toEqual({ who: "jonz" });
    expect(auditLikeThis({ actor: "someone", action: "account.delete_request", at }, "owner-1", words)[0].params).toEqual({ who: "others" });
  });

  it("leaves What out for a kind the drop-down doesn't have", () => {
    expect(auditLikeThis({ actor: null, action: "house.open", at }, null, words).map((like) => like.label)).toEqual([
      "Everything Jonz did by itself",
      "Around this time",
    ]);
  });
});

describe("the search box's suggestions", () => {
  const labels = (text: string) => listSuggestions(text, AUDIT_FACETS, NOW, ZONE).map((s) => s.label);

  it("lists every filter's choices with nothing typed, so you can see what there is", () => {
    expect(labels("")).toEqual([
      "Who: You",
      "Who: Someone else",
      "Who: Jonz itself",
      "What: Notices",
      "What: Accounts",
      "When: The last hour",
      "When: Today",
      "When: The last 7 days",
      "When: The last 30 days",
    ]);
  });

  it("turns words into filters by their names, their choices, or other words for them", () => {
    expect(labels("who")).toEqual(["Who: You", "Who: Someone else", "Who: Jonz itself", "Search for “who”"]);
    expect(labels("me")).toEqual(["Who: You", "Search for “me”"]);
    expect(labels("del")).toEqual(["What: Accounts", "Search for “del”"]);
    expect(labels("last 7")).toEqual(["When: The last 7 days", "Search for “last 7”"]);
    expect(labels("week")).toEqual(["When: The last 7 days", "Search for “week”"]);
  });

  it("always offers searching the words themselves, last", () => {
    expect(labels("jonz is slow")).toEqual(["Search for “jonz is slow”"]);
  });

  it("offers a moment to start from", () => {
    expect(labels("29 oct 23:30")).toEqual(["Start from Thu 29 Oct, 23:30", "Search for “29 oct 23:30”"]);
  });
});

describe("a moment typed into the box", () => {
  const moment = (text: string) => parseMoment(text, NOW, ZONE)?.toISOString() ?? null;

  it("reads a time today, yesterday, a day of a month, and a full date", () => {
    expect(moment("09:15")).toBe("2026-10-30T09:15:00.000Z");
    expect(moment("yesterday 18:00")).toBe("2026-10-29T18:00:00.000Z");
    expect(moment("29 Oct 23:30")).toBe("2026-10-29T23:30:00.000Z");
    expect(moment("oct 29")).toBe("2026-10-29T23:59:59.000Z");
    expect(moment("2026-10-01 08:00")).toBe("2026-10-01T07:00:00.000Z");
  });

  it("takes a day still to come this year as last year's", () => {
    expect(moment("25 dec")).toBe("2025-12-25T23:59:59.000Z");
  });

  it("reads nothing still to come, or that isn't a moment", () => {
    expect(moment("23:30")).toBeNull();
    expect(moment("31 feb")).toBeNull();
    expect(moment("slow")).toBeNull();
    expect(moment("25:00")).toBeNull();
  });
});

describe("tags in the box", () => {
  const plain = { q: "", picks: {}, when: "any" as const, from: null };

  it("turns a suggestion into a tag, taking its words out of the search", () => {
    const [you] = listSuggestions("me", AUDIT_FACETS, NOW, ZONE);
    const query = applySuggestion({ ...plain, q: "me" }, you);
    expect(query).toEqual({ q: "", picks: { who: "you" }, when: "any", from: null });
    expect(listTags(query, AUDIT_FACETS, ZONE)).toEqual([{ key: "who", label: "Who: You" }]);
  });

  it("keeps the words when they're what you search for", () => {
    const words = listSuggestions("slow", AUDIT_FACETS, NOW, ZONE).at(-1)!;
    expect(applySuggestion(plain, words)).toEqual({ ...plain, q: "slow" });
  });

  it("shows When, or the moment the list starts from, after the filters", () => {
    const query = { ...plain, picks: { what: "notices", who: "jonz" }, when: "today" as const };
    expect(listTags(query, AUDIT_FACETS, ZONE).map((tag) => tag.label)).toEqual(["Who: Jonz itself", "What: Notices", "When: Today"]);
    expect(listTags({ ...query, from: "2026-10-29T23:30:00.000Z" }, AUDIT_FACETS, ZONE).at(-1)).toEqual({
      key: "from",
      label: "From Thu 29 Oct, 23:30",
    });
  });

  it("takes one tag away and leaves the rest", () => {
    const query = { ...plain, picks: { who: "you", what: "notices" }, when: "week" as const };
    expect(dropTag(query, "who")).toEqual({ ...query, picks: { what: "notices" } });
    expect(dropTag(query, "when")).toEqual({ ...query, when: "any" });
  });
});

describe("Deletions' search box", () => {
  it("calls When Asked, and doesn't start from a moment, since the list goes soonest first", () => {
    const labels = (text: string) => listSuggestions(text, DELETION_FACETS, NOW, ZONE, DELETION_WHEN).map((s) => s.label);
    expect(labels("asked today")).toEqual(["Asked: Today", "Search for “asked today”"]);
    expect(labels("yesterday 18:00")).toEqual(["Search for “yesterday 18:00”"]);
    expect(labels("emailed")).toEqual(["Started: By you", "Search for “emailed”"]);
    expect(labels("soon")).toEqual(["Goes: Within a day", "Goes: Within a week", "Search for “soon”"]);
  });

  it("names its tags the same way", () => {
    const query = { q: "", picks: { by: "owner", goes: "day" }, when: "week" as const, from: null };
    expect(listTags(query, DELETION_FACETS, ZONE, "any", DELETION_WHEN.label).map((t) => t.label)).toEqual([
      "Started: By you",
      "Goes: Within a day",
      "Asked: The last 7 days",
    ]);
  });
});

describe("Notices' search box", () => {
  it("finds words in a notice's title or body, and nothing that could change the filter", () => {
    expect(noticeSearchFilter("slow")).toBe('title.ilike."*slow*",body.ilike."*slow*"');
    expect(noticeSearchFilter('a"),id.eq.(1')).toBe('title.ilike."*a id.eq. 1*",body.ilike."*a id.eq. 1*"');
    expect(noticeSearchFilter("  ")).toBeNull();
  });

  it("turns words into a kind or a state", () => {
    const labels = (text: string) => listSuggestions(text, NOTICE_FACETS, NOW, ZONE).map((s) => s.label);
    expect(labels("outage")).toEqual(["Kind: Something’s wrong", "Search for “outage”"]);
    expect(labels("ended")).toEqual(["State: Ended", "Search for “ended”"]);
  });
});

