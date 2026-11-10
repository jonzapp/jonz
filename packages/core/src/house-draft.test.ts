import { describe, expect, it } from "vitest";

import { ASK_USAGE_COPY } from "./copy";
import { NEW_JOHN, type JohnDef } from "./board";

import {
  askAllowance,
  askBackOn,
  askUsage,
  DRAFT_MAX_GROUPS,
  DRAFT_MAX_JOHNS,
  CHOICES_MAX,
  ChatRequest,
  DraftedJohn,
  HouseDraft,
  STARTER_KINDS,
  STARTER_LISTS,
  changedLine,
  draftChanges,
  draftForModel,
  groupChanges,
  listAsDraft,
  draftPlan,
  guessStarter,
  matchPerson,
  offlineTurn,
  starterDraft,
  tidyAsk,
  tidyDraft,
} from "./house-draft";
import { HOUSE_DRAFT_COPY } from "./copy";
import { JohnDraft } from "./schemas";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const ME = "00000000-0000-4000-8000-000000000001";
const SAM = "00000000-0000-4000-8000-000000000002";
const SAM_B = "00000000-0000-4000-8000-000000000003";
const people = [
  { userId: ME, name: "Glyn Finck" },
  { userId: SAM, name: "Sam Okafor" },
];

describe("ChatRequest", () => {
  const houseId = ME;
  const said = (text: string) => ({ role: "user" as const, text });

  it("takes the chat so far, ending with what the admin said, and the draft as it stands", () => {
    expect(ChatRequest.safeParse({ houseId, messages: [said("Three of us in a flat")], draft: null }).success).toBe(true);
    expect(ChatRequest.safeParse({ houseId, messages: [said("Fewer bathrooms")], draft: starterDraft("couple") }).success).toBe(true);
  });

  it("refuses an empty message, an essay, an empty chat, or one ending with Jonz", () => {
    expect(ChatRequest.safeParse({ houseId, messages: [said("   ")], draft: null }).success).toBe(false);
    expect(ChatRequest.safeParse({ houseId, messages: [said("x".repeat(801))], draft: null }).success).toBe(false);
    expect(ChatRequest.safeParse({ houseId, messages: [], draft: null }).success).toBe(false);
    expect(
      ChatRequest.safeParse({ houseId, messages: [said("Hi"), { role: "assistant", text: "Hello" }], draft: null }).success,
    ).toBe(false);
  });
});

describe("tidyAsk", () => {
  it("keeps quick answers trimmed, once each, and only a few", () => {
    expect(tidyAsk({ kind: "choices", options: [" Oven ", "oven", "Windows", 4, ""] })).toEqual({ kind: "choices", options: ["Oven", "Windows"] });
    const many = tidyAsk({ kind: "choices", options: Array.from({ length: 9 }, (_, i) => `Option ${i}`) });
    expect(many?.kind === "choices" && many.options).toHaveLength(CHOICES_MAX);
  });

  it("asks for a day, or nothing when there's nothing to tap", () => {
    expect(tidyAsk({ kind: "day", options: ["ignored"] })).toEqual({ kind: "day" });
    expect(tidyAsk({ kind: "choices", options: [] })).toBeNull();
    expect(tidyAsk({ kind: "none" })).toBeNull();
    expect(tidyAsk(null)).toBeNull();
  });
});

describe("draftForModel", () => {
  it("shows Claude a draft in words, which tidyDraft reads back the same", () => {
    const draft = tidyDraft(
      {
        groups: [{ name: "Upstairs", members: ["me", "Sam", "Priya"] }],
        johns: [
          { name: "Upstairs bathroom", category: "bathroom", points: 4, group: "Upstairs" },
          { name: "Kitchen bin", category: "bins", points: 1, onCall: true },
        ],
        note: "I guessed the bins.",
      },
      people,
      ME,
    );
    const shown = draftForModel(draft, people, ME);
    expect(shown.groups).toEqual([{ name: "Upstairs", members: ["me", "Sam", "Priya"] }]);
    expect(shown.johns?.[1]).toMatchObject({ name: "Kitchen bin", onCall: true });
    expect(tidyDraft(shown, people, ME)).toEqual(draft);
  });
});

describe("offlineTurn", () => {
  const said = (text: string) => ({ role: "user" as const, text });

  it("offers the starter list that fits what was said", () => {
    expect(offlineTurn([said("Me, my wife and the kids")], null)).toEqual({
      reply: HOUSE_DRAFT_COPY.offline,
      ask: null,
      draft: starterDraft("family"),
      source: "starter",
    });
  });

  it("offers the starter list the admin named", () => {
    const turn = offlineTurn([said(HOUSE_DRAFT_COPY.starter.couple.title)], null);
    expect(turn.draft).toEqual(starterDraft("couple"));
    expect(turn.reply).toBe(HOUSE_DRAFT_COPY.fromStarter);
  });

  it("leaves a draft that's already there as it is", () => {
    expect(offlineTurn([said("Oven every month")], starterDraft("couple"))).toEqual({
      reply: HOUSE_DRAFT_COPY.offlineChange,
      ask: null,
      draft: null,
      source: "starter",
    });
  });
});

describe("matchPerson", () => {
  it("finds a housemate by full or first name, any case", () => {
    expect(matchPerson("sam", people)).toBe(SAM);
    expect(matchPerson("Sam Okafor", people)).toBe(SAM);
    expect(matchPerson("GLYN", people)).toBe(ME);
  });

  it("finds nobody for a name nobody goes by, or one two people share", () => {
    expect(matchPerson("Priya", people)).toBeNull();
    expect(matchPerson("", people)).toBeNull();
    expect(matchPerson("Sam", [...people, { userId: SAM_B, name: "Sam Lee" }])).toBeNull();
  });
});

describe("tidyDraft", () => {
  it("puts numbers in range and fills what's missing", () => {
    const draft = tidyDraft(
      {
        johns: [
          { name: "  Oven   clean ", category: "kitchen", points: 24, everyWeeks: 0, dueDow: 9, dueTime: "7:30", why: "nobody does it" },
          { name: "Plants", category: "garden", points: "2.6", dueTime: "25:00" },
        ],
      },
      people,
      ME,
    );
    expect(draft.johns[0]).toMatchObject({ name: "Oven clean", points: 20, everyWeeks: 1, everyMonths: null, weekOfMonth: null, dueDow: 7, dueTime: "07:30", why: "nobody does it" });
    expect(draft.johns[1]).toMatchObject({ name: "Plants", category: "other", points: 3, everyWeeks: 1, dueTime: "21:00", when: "day", group: null });
    for (const j of draft.johns) expect(DraftedJohn.safeParse(j).success).toBe(true);
  });

  it("takes any period: weeks up to 26, or months on a weekday of the month", () => {
    const draft = tidyDraft(
      {
        johns: [
          { name: "Fridge deep clean", everyMonths: 3, weekOfMonth: 1, dueDow: 6 },
          { name: "Gutters", everyMonths: 12, weekOfMonth: 9, everyWeeks: 4 },
          { name: "Sheets", everyWeeks: 40, everyMonths: null },
          { name: "Bins", everyMonths: 3, onCall: true },
          { name: "Windows", everyMonths: "quarterly" },
          { name: "Boiler service", everyMonths: 99 },
        ],
      },
      people,
      ME,
    );
    const by = (name: string) => draft.johns.find((j) => j.name === name);
    expect(by("Fridge deep clean")).toMatchObject({ everyWeeks: 1, everyMonths: 3, weekOfMonth: 1, dueDow: 6 });
    expect(by("Gutters")).toMatchObject({ everyWeeks: 1, everyMonths: 12, weekOfMonth: 5 });
    expect(by("Sheets")).toMatchObject({ everyWeeks: 26, everyMonths: null, weekOfMonth: null });
    expect(by("Bins")).toMatchObject({ when: "on_call", everyMonths: null, weekOfMonth: null });
    expect(by("Windows")).toMatchObject({ everyMonths: null, weekOfMonth: null });
    expect(by("Boiler service")).toMatchObject({ everyMonths: 60, weekOfMonth: 1 });
    for (const j of draft.johns) expect(DraftedJohn.safeParse(j).success).toBe(true);
  });

  it("makes an on-call John only when asked, with its window in range", () => {
    const [bin] = tidyDraft({ johns: [{ name: "Kitchen bin", category: "bins", points: 1, onCall: true, respondHours: 200, perWeek: 0 }] }, people, ME).johns;
    expect(bin).toMatchObject({ when: "on_call", respondHours: 72, perWeek: 1 });
  });

  it("keeps the same John once, and drops nameless ones", () => {
    const draft = tidyDraft({ johns: [{ name: "Bins" }, { name: "bins" }, { name: "   " }, { name: 7 }] }, people, ME);
    expect(draft.johns.map((j) => j.name)).toEqual(["Bins"]);
  });

  it("matches a group's people to the house, with me for I, and waits for the rest", () => {
    const draft = tidyDraft(
      {
        groups: [{ name: "Upstairs", members: ["me", "sam", "Priya", "priya"] }],
        johns: [{ name: "Upstairs bathroom", category: "bathroom", group: "upstairs" }],
      },
      people,
      ME,
    );
    expect(draft.groups).toEqual([{ name: "Upstairs", memberIds: [ME, SAM], waitingFor: ["Priya"] }]);
    expect(draft.johns[0].group).toBe("Upstairs");
  });

  it("drops a John's group when no such group was drafted, and a group no John uses", () => {
    const draft = tidyDraft(
      { groups: [{ name: "Downstairs", members: ["Sam"] }, { name: "Nobody", members: [] }], johns: [{ name: "Hall", group: "Attic" }] },
      people,
      ME,
    );
    expect(draft.johns[0].group).toBeNull();
    expect(draft.groups).toEqual([]);
  });

  it("caps a long draft", () => {
    const draft = tidyDraft(
      {
        johns: Array.from({ length: 50 }, (_, i) => ({ name: `John ${i}`, group: `G${i % 10}` })),
        groups: Array.from({ length: 10 }, (_, i) => ({ name: `G${i}`, members: ["Sam"] })),
      },
      people,
      ME,
    );
    expect(draft.johns).toHaveLength(DRAFT_MAX_JOHNS);
    expect(draft.groups.length).toBeLessThanOrEqual(DRAFT_MAX_GROUPS);
  });

  it("copes with nothing at all", () => {
    expect(tidyDraft({}, [], ME)).toEqual({ johns: [], groups: [], note: null });
    expect(tidyDraft({ note: "  I put the bins on Tuesday.  " }, [], ME).note).toBe("I put the bins on Tuesday.");
  });

  it("always gives a draft the API can send", () => {
    const draft = tidyDraft({ johns: [{ name: "x".repeat(90), why: "y".repeat(300) }], groups: [{ name: "g".repeat(60), members: ["Sam"] }] }, people, ME);
    expect(HouseDraft.safeParse(draft).success).toBe(true);
    expect(draft.johns[0].name).toHaveLength(60);
  });
});

describe("draftPlan", () => {
  const draft = tidyDraft(
    {
      groups: [
        { name: "Upstairs", members: ["me", "Sam"] },
        { name: "Downstairs", members: ["Priya", "Tom"] },
        { name: "Garden", members: ["Sam"] },
      ],
      johns: [
        { name: "Upstairs bathroom", category: "bathroom", group: "Upstairs" },
        { name: "Downstairs bathroom", category: "bathroom", group: "Downstairs" },
        { name: "Mow", category: "other", group: "Garden" },
        { name: "Kitchen", category: "kitchen" },
      ],
    },
    people,
    ME,
  );

  it("makes the groups the kept Johns need, and leaves the rest", () => {
    const plan = draftPlan(draft, [0, 1, 3], []);
    expect(plan.makeGroups).toEqual([{ name: "Upstairs", members: [ME, SAM] }]);
    expect(plan.johns.map((j) => [j.john.name, j.groupName])).toEqual([
      ["Upstairs bathroom", "Upstairs"],
      ["Downstairs bathroom", null],
      ["Kitchen", null],
    ]);
    expect(plan.everyoneForNow).toEqual(["Downstairs bathroom"]);
  });

  it("uses a group the house already has", () => {
    const plan = draftPlan(draft, [2], [{ name: "garden" }]);
    expect(plan.makeGroups).toEqual([]);
    expect(plan.johns[0].groupName).toBe("garden");
  });

  it("writes Johns the John list takes", () => {
    for (const { john } of draftPlan(draft, [0, 1, 2, 3], []).johns) {
      expect(JohnDraft.safeParse({ ...john, groupId: null }).success).toBe(true);
      expect(john).not.toHaveProperty("why");
    }
  });

  it("keeps nothing when nothing is picked", () => {
    expect(draftPlan(draft, [], [])).toEqual({ makeGroups: [], johns: [], everyoneForNow: [] });
  });
});

describe("starter lists", () => {
  it.each(STARTER_KINDS)("%s is a valid draft of Johns the list takes", (kind) => {
    const draft = starterDraft(kind);
    expect(HouseDraft.safeParse(draft).success).toBe(true);
    expect(draft.johns.length).toBeGreaterThan(4);
    for (const j of draft.johns) expect(JohnDraft.safeParse({ ...j, groupId: null }).success).toBe(true);
  });

  it("hands out copies, so ticking a draft never changes the list", () => {
    starterDraft("couple").johns[0].name = "changed";
    expect(STARTER_LISTS.couple[0].name).not.toBe("changed");
  });
});

describe("guessStarter", () => {
  it.each([
    ["Me, my wife and our two kids in a semi", "family"],
    ["Just me and my boyfriend in a one-bed", "couple"],
    ["Two of us in a flat", "couple"],
    ["Five students, one kitchen", "flat_share"],
    ["", "flat_share"],
  ] as const)("%s → %s", (description, kind) => {
    expect(guessStarter(description)).toBe(kind);
  });
});

describe("changing a list that's already there", () => {
  const ME = "00000000-0000-4000-8000-000000000001";
  const BATH = "11111111-1111-4111-8111-111111111111";
  const BINS = "22222222-2222-4222-8222-222222222222";
  const UP = { id: "33333333-3333-4333-8333-333333333333", name: "Upstairs", memberIds: [ME] };
  const john = (id: string, name: string, more: Partial<JohnDef> = {}): JohnDef => ({ ...NEW_JOHN, id, name, ...more });
  const list = [john(BATH, "Bathroom", { category: "bathroom", points: 3, groupId: UP.id }), john(BINS, "Bins out", { category: "bins", points: 1 })];
  const base = listAsDraft(list, [UP]);

  it("reads the list as a draft, with ids and the groups it uses", () => {
    expect(base.johns.map((j) => [j.id, j.name, j.group])).toEqual([
      [BATH, "Bathroom", "Upstairs"],
      [BINS, "Bins out", null],
    ]);
    expect(base.groups).toEqual([{ name: "Upstairs", memberIds: [ME], waitingFor: [] }]);
    expect(draftChanges(base, base)).toEqual([]);
  });

  it("shows Claude short refs, and reads them back to the list's Johns", () => {
    const raw = draftForModel(base, [{ userId: ME, name: "Glyn" }], ME);
    expect(raw.johns?.[0]).toMatchObject({ ref: BATH.slice(0, 8), name: "Bathroom" });
    expect(JSON.stringify(raw)).not.toContain(BATH);
    const back = tidyDraft(raw, [{ userId: ME, name: "Glyn" }], ME, { johnIds: [BATH, BINS], groups: base.groups });
    expect(back.johns.map((j) => j.id)).toEqual([BATH, BINS]);
    expect(draftChanges(base, back)).toEqual([]);
  });

  it("keeps a list's group when Claude leaves it out of the groups, and never reuses a ref", () => {
    const back = tidyDraft(
      {
        johns: [
          { ref: BATH.slice(0, 8), name: "Bathroom", category: "bathroom", points: 4, group: "Upstairs" },
          { ref: BATH.slice(0, 8), name: "Bathroom deep clean", category: "bathroom", points: 5 },
          { ref: "nope", name: "Oven", category: "kitchen", points: 5, everyWeeks: 4 },
        ],
      },
      [],
      ME,
      { johnIds: [BATH, BINS], groups: base.groups },
    );
    expect(back.johns.map((j) => [j.id ?? null, j.group])).toEqual([
      [BATH, "Upstairs"],
      [null, null],
      [null, null],
    ]);
    const changes = draftChanges(base, back);
    expect(changes.map((c) => c.key)).toEqual(["change:" + BATH, "add:1", "add:2", "remove:" + BINS]);
    const changed = changes[0];
    if (changed.kind !== "change") throw new Error("not a change");
    expect(changedLine(changed.before, changed.john, words)).toBe("3 → 4 pts");
  });

  it("says what changed in words, before → after", () => {
    const [bath] = base.johns;
    expect(changedLine(bath, { ...bath, name: "Upstairs bathroom", everyWeeks: 2, dueDow: 6, group: null }, words)).toBe(
      "was “Bathroom”, Every week → every 2 weeks, Sun 21:00 → Sat 21:00, Upstairs → everyone’s",
    );
    expect(changedLine(bath, { ...bath, when: "on_call" }, words)).toBe("Every week → on call");
  });

  it("treats every John in a new house's draft as one to add", () => {
    expect(draftChanges(null, starterDraft("couple")).every((c) => c.kind === "add")).toBe(true);
  });

  it("lists groups with no Johns too, so Jonz can change who's in them", () => {
    const floor = { id: "44444444-4444-4444-8444-444444444444", name: "Main floor", memberIds: [ME] };
    expect(listAsDraft(list, [UP, floor]).groups.map((g) => g.name)).toEqual(["Upstairs", "Main floor"]);
  });

  it("finds a group whose people changed, keeping the house's name for it", () => {
    const IVY = "00000000-0000-4000-8000-000000000009";
    const next = { ...base, groups: [{ name: "upstairs", memberIds: [ME, IVY], waitingFor: [] }] };
    expect(groupChanges(base, next)).toEqual([
      { kind: "group", key: "group:Upstairs", group: { name: "Upstairs", memberIds: [ME, IVY], waitingFor: [] }, before: base.groups[0] },
    ]);
    expect(groupChanges(base, base)).toEqual([]);
    expect(groupChanges(null, next)).toEqual([]);
    expect(groupChanges(base, { ...base, groups: [{ name: "Upstairs", memberIds: [], waitingFor: [] }] })).toEqual([]);
    expect(draftChanges(base, next)).toEqual([]);
  });

  it("says who's in a group, before → after", () => {
    expect(HOUSE_DRAFT_COPY.groupPeople("You and Sam", "You, Sam and Ivy")).toBe("You and Sam → You, Sam and Ivy");
  });
});

describe("askAllowance", () => {
  const resetsAt = new Date("2026-11-09T00:00:00Z");
  it("gives someone living alone the whole pool", () => {
    expect(askAllowance({ pool: 1000, people: 1, houseUsed: 250, mineUsed: 250, resetsAt })).toEqual({ cap: 1000, left: 0.75, house: true, resetsAt: resetsAt.toISOString() });
  });
  it("caps each person at half when two or more live there", () => {
    expect(askAllowance({ pool: 1000, people: 3, houseUsed: 300, mineUsed: 250, resetsAt })).toMatchObject({ cap: 500, left: 0.5, house: false });
  });
  it("says when the house runs out before their share does", () => {
    expect(askAllowance({ pool: 1000, people: 3, houseUsed: 900, mineUsed: 0, resetsAt })).toMatchObject({ left: 0.2, house: true });
    expect(askAllowance({ pool: 1000, people: 3, houseUsed: 1200, mineUsed: 0, resetsAt })).toMatchObject({ left: 0, house: true });
  });
  it("never says more than all of it, or less than none", () => {
    expect(askAllowance({ pool: 1000, people: 2, houseUsed: 0, mineUsed: 0, resetsAt }).left).toBe(1);
    expect(askAllowance({ pool: 1000, people: 2, houseUsed: 600, mineUsed: 600, resetsAt }).left).toBe(0);
  });
});

describe("askUsage", () => {
  const resetsAt = new Date("2026-11-09T00:00:00Z");
  const [ava, ben, cat] = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
  it("gives the house's use, theirs as a share of their half, and each person's, most first", () => {
    const usage = askUsage({ pool: 1000, pass: false, people: [ava, ben, cat], me: ben, used: new Map([[ava, 300], [ben, 100]]), resetsAt });
    expect(usage).toMatchObject({ pass: false, people: 3, houseUsed: 0.4, mineUsed: 0.2, left: 0.8, house: false, resetsAt: resetsAt.toISOString() });
    expect(usage.usedBy).toEqual([
      { userId: ava, used: 0.3 },
      { userId: ben, used: 0.1 },
      { userId: cat, used: 0 },
    ]);
  });
  it("never shows more than all of it used, even with a turn's reserve on top", () => {
    const usage = askUsage({ pool: 1000, pass: true, people: [ava], me: ava, used: new Map([[ava, 1200]]), resetsAt });
    expect(usage).toMatchObject({ houseUsed: 1, mineUsed: 1, left: 0, house: true });
  });
  it("leaves out someone who has moved on but keeps the house's total", () => {
    const usage = askUsage({ pool: 1000, pass: false, people: [ava, ben], me: ava, used: new Map([[ava, 100], [cat, 500]]), resetsAt });
    expect(usage.houseUsed).toBe(0.6);
    expect(usage.usedBy.map((p) => p.userId)).toEqual([ava, ben]);
  });
});

describe("askBackOn", () => {
  it("says the day and time the house's week starts, in the house's time", () => {
    expect(askBackOn("2026-11-09T00:00:00.000Z", "Europe/London")).toBe("Monday at 00:00");
    expect(askBackOn("2026-11-09T05:00:00.000Z", "America/New_York")).toBe("Monday at 00:00");
    expect(askBackOn("2026-11-08T23:00:00.000Z", "Europe/Paris")).toBe("Monday at 00:00");
  });
});

describe("ASK_USAGE_COPY", () => {
  it("never rounds a little to none or nearly all to all", () => {
    expect(ASK_USAGE_COPY.used(0.001)).toBe("1% used");
    expect(ASK_USAGE_COPY.used(0.999)).toBe("99% used");
    expect(ASK_USAGE_COPY.used(0)).toBe("0% used");
    expect(ASK_USAGE_COPY.used(1)).toBe("100% used");
  });
  it("names whose Ask Jonz is low", () => {
    expect(ASK_USAGE_COPY.low(0.18, false, "Monday at 00:00")).toBe("Only 18% of your Ask Jonz left this week. More on Monday at 00:00.");
    expect(ASK_USAGE_COPY.low(0.1, true, "Monday at 00:00")).toContain("the house’s");
  });
});
