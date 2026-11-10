import { describe, expect, it } from "vitest";

import {
  AwayDraft,
  CastVote,
  CreateHouse,
  DealRequest,
  DisplayName,
  disputeProblem,
  FreshRequest,
  GroupDraft,
  HouseSettings,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  JoinCode,
  JohnDraft,
  MAX_AMOUNT_MINOR,
  MoveResponse,
  normaliseJoinCode,
  RaiseDispute,
} from "./schemas";

describe("join codes", () => {
  it("tidies a code as people type it", () => {
    expect(normaliseJoinCode("ab3d-ef7h")).toBe("AB3DEF7H");
    expect(normaliseJoinCode(" AB 3D EF 7H ")).toBe("AB3DEF7H");
    expect(normaliseJoinCode("AB3DEF7H")).toBe("AB3DEF7H");
  });

  it("refuses what can’t be a code", () => {
    expect(normaliseJoinCode("")).toBeNull();
    expect(normaliseJoinCode("AB3DEF7")).toBeNull();
    expect(normaliseJoinCode("AB3DEF7HJ")).toBeNull();
    // Look-alikes the database never makes.
    for (const c of ["0", "O", "1", "I", "L"]) expect(normaliseJoinCode(`AB3DEF7${c}`)).toBeNull();
    expect(normaliseJoinCode("AB3DÉF7H")).toBeNull();
    expect(normaliseJoinCode("AB3D/F7H")).toBeNull();
  });

  it("matches the database’s alphabet and length", () => {
    expect(JOIN_CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    expect(JOIN_CODE_LENGTH).toBe(8);
    expect(JoinCode.parse("xyz2-3456")).toBe("XYZ23456");
    expect(JoinCode.safeParse("nope").success).toBe(false);
  });
});

describe("CreateHouse", () => {
  const house = { name: "  Flat 3 ", timezone: "Europe/London", currency: "GBP", weekStarts: "1" };

  it("trims the name and reads the week’s first day as a number", () => {
    expect(CreateHouse.parse(house)).toEqual({ name: "Flat 3", timezone: "Europe/London", currency: "GBP", weekStarts: 1 });
  });

  it("asks for a name, and keeps it to sixty characters", () => {
    expect(CreateHouse.safeParse({ ...house, name: "   " }).error?.issues[0].message).toBe("Give the house a name.");
    expect(CreateHouse.safeParse({ ...house, name: "x".repeat(60) }).success).toBe(true);
    expect(CreateHouse.safeParse({ ...house, name: "x".repeat(61) }).success).toBe(false);
  });

  it("refuses an unknown currency or a day outside the week", () => {
    expect(CreateHouse.safeParse({ ...house, currency: "JPY" }).success).toBe(false);
    expect(CreateHouse.safeParse({ ...house, weekStarts: 0 }).success).toBe(false);
    expect(CreateHouse.safeParse({ ...house, weekStarts: 8 }).success).toBe(false);
    expect(CreateHouse.safeParse({ ...house, weekStarts: 1.5 }).success).toBe(false);
  });
});

describe("FreshRequest", () => {
  it("takes one house’s id", () => {
    const houseId = "8f14e45f-ceea-467f-a8f5-2fbf7c2d9b1a";
    expect(FreshRequest.parse({ houseId })).toEqual({ houseId });
    expect(FreshRequest.safeParse({ houseId: "not-a-uuid" }).success).toBe(false);
    expect(FreshRequest.safeParse({}).success).toBe(false);
  });
});

describe("RaiseDispute", () => {
  const assignmentId = "8f14e45f-ceea-467f-a8f5-2fbf7c2d9b1a";
  const message = (input: unknown) => RaiseDispute.safeParse(input).error?.issues[0]?.message;

  it("takes the John and the reason, tidied", () => {
    expect(RaiseDispute.parse({ assignmentId, reason: "  Bins still full  " })).toEqual({
      assignmentId,
      reason: "Bins still full",
    });
    expect(RaiseDispute.parse({ assignmentId, reason: "x".repeat(280) }).reason).toHaveLength(280);
  });

  it("asks for a reason, and a short one, in words", () => {
    expect(message({ assignmentId, reason: "" })).toBe("Say what’s wrong with it.");
    expect(message({ assignmentId, reason: "   " })).toBe("Say what’s wrong with it.");
    expect(message({ assignmentId, reason: "x".repeat(281) })).toBe("Keep it under 280 characters.");
  });

  it("refuses anything but a John’s id", () => {
    expect(RaiseDispute.safeParse({ assignmentId: "a1", reason: "Still full" }).success).toBe(false);
    expect(RaiseDispute.safeParse({ reason: "Still full" }).success).toBe(false);
  });

  it("says what’s wrong in one sentence, the reason’s first", () => {
    const problem = (input: unknown) => disputeProblem(RaiseDispute.safeParse(input).error!.issues);
    expect(problem({ assignmentId, reason: "" })).toBe("Say what’s wrong with it.");
    expect(problem({ assignmentId: "a1", reason: "" })).toBe("Say what’s wrong with it.");
    expect(problem({ assignmentId: "a1", reason: "Still full" })).toBe("Say which John to dispute.");
    expect(problem(null)).toBe("Say which John to dispute.");
    expect(disputeProblem([])).toBe("Say which John to dispute.");
  });
});

describe("CastVote and MoveResponse", () => {
  it("takes a yes or a no, and nothing else", () => {
    expect(CastVote.parse({ uphold: true })).toEqual({ uphold: true });
    expect(CastVote.parse({ uphold: false })).toEqual({ uphold: false });
    expect(CastVote.safeParse({ uphold: "yes" }).success).toBe(false);
    expect(CastVote.safeParse({}).success).toBe(false);
  });

  it("answers ok", () => {
    expect(MoveResponse.parse({ ok: true })).toEqual({ ok: true });
    expect(MoveResponse.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("HouseSettings", () => {
  const rules = {
    name: " Flat 3 ",
    timezone: "Europe/London",
    currency: "GBP",
    weekStarts: 1,
    stakeMinor: 2000,
    lateForfeitMinor: 100,
    missedForfeitMinor: 300,
    disputeHours: 24,
    awayMakeup: 100,
  };

  it("takes the rules an admin sets, tidied", () => {
    expect(HouseSettings.parse(rules)).toEqual({ ...rules, name: "Flat 3" });
    // A form's strings coerce, as the web's fields send them.
    expect(HouseSettings.parse({ ...rules, weekStarts: "7", stakeMinor: "0", disputeHours: "0" })).toMatchObject({
      weekStarts: 7,
      stakeMinor: 0,
      disputeHours: 0,
    });
  });

  it("takes how the house shares Johns and its budget, when the form has them", () => {
    expect(HouseSettings.parse({ ...rules, dealMode: "classic", dealBudget: "2" })).toMatchObject({ dealMode: "classic", dealBudget: 2 });
    expect(HouseSettings.parse({ ...rules, dealBudget: 0 }).dealBudget).toBe(0);
  });

  it("says what’s wrong in words", () => {
    const problem = (patch: object) => HouseSettings.safeParse({ ...rules, ...patch }).error?.issues[0].message;
    expect(problem({ name: "  " })).toBe("Give the house a name.");
    expect(problem({ timezone: "" })).toBe("Say which time zone the house is in.");
    expect(problem({ stakeMinor: -1 })).toBe("Amounts can’t be negative.");
    expect(problem({ missedForfeitMinor: MAX_AMOUNT_MINOR + 1 })).toBe("Amounts are up to 1,000.");
    expect(problem({ stakeMinor: MAX_AMOUNT_MINOR })).toBeUndefined();
  });

  it("refuses rules the house can’t have", () => {
    for (const patch of [
      { currency: "JPY" },
      { weekStarts: 0 },
      { weekStarts: 8 },
      { disputeHours: 73 },
      { dealMode: "random" },
      { dealBudget: 3 },
      { awayMakeup: 75 },
      { stakeMinor: 2.5 },
    ]) {
      expect(HouseSettings.safeParse({ ...rules, ...patch }).success).toBe(false);
    }
  });
});

describe("JohnDraft", () => {
  const john = {
    name: " Bins ",
    category: "bins",
    points: 2,
    everyWeeks: 1,
    dueDow: 7,
    dueTime: "21:00",
    needsPhoto: false,
    groupId: null,
  };

  it("takes a new John, and an edit of one", () => {
    expect(JohnDraft.parse(john)).toEqual({
      ...john,
      name: "Bins",
      when: "day",
      respondHours: 12,
      perWeek: 2,
      crew: 1,
      keepDay: false,
      everyMonths: null,
      weekOfMonth: null,
      anchorMonth: null,
    });
    const id = crypto.randomUUID();
    expect(JohnDraft.parse({ ...john, id, groupId: id })).toMatchObject({ id, groupId: id });
  });

  it("takes an on-call John, its window kept to between an hour and three days", () => {
    expect(JohnDraft.parse({ ...john, when: "on_call", respondHours: "8", perWeek: 3 })).toMatchObject({
      when: "on_call",
      respondHours: 8,
      perWeek: 3,
    });
    const problem = (patch: object) => JohnDraft.safeParse({ ...john, when: "on_call", ...patch }).error?.issues[0].message;
    expect(problem({ respondHours: 0 })).toBe("Give between 1 and 72 hours.");
    expect(problem({ respondHours: 73 })).toBe("Give between 1 and 72 hours.");
    expect(problem({ perWeek: 15 })).toBeDefined();
    expect(problem({ when: "sometimes" })).toBeDefined();
  });

  it("takes any period: every 26 weeks, or every few months on a weekday of the month, effort up to 20", () => {
    expect(JohnDraft.safeParse({ ...john, everyWeeks: 26, points: 20 }).success).toBe(true);
    expect(JohnDraft.parse({ ...john, everyMonths: 3, weekOfMonth: 1, anchorMonth: 24322 })).toMatchObject({
      everyMonths: 3,
      weekOfMonth: 1,
      anchorMonth: 24322,
    });
    expect(JohnDraft.safeParse({ ...john, everyMonths: 60, weekOfMonth: 5 }).success).toBe(true);
    expect(JohnDraft.safeParse({ ...john, everyMonths: 3 }).error?.issues[0].message).toBe("Say which week of the month it lands in.");
  });

  it("says what’s wrong in words", () => {
    const problem = (patch: object) => JohnDraft.safeParse({ ...john, ...patch }).error?.issues[0].message;
    expect(problem({ name: "" })).toBe("Name the John.");
    expect(problem({ dueTime: "9pm" })).toBe("Give a time like 21:00.");
    expect(problem({ dueTime: "24:00" })).toBe("Give a time like 21:00.");
    expect(problem({ dueTime: "23:59" })).toBeUndefined();
    expect(problem({ dueTime: "00:00" })).toBeUndefined();
  });

  it("takes any period: every 26 weeks, or every few months on a weekday of the month, effort up to 20", () => {
    expect(JohnDraft.safeParse({ ...john, everyWeeks: 26, points: 20 }).success).toBe(true);
    expect(JohnDraft.parse({ ...john, everyMonths: 3, weekOfMonth: 1, anchorMonth: 24322 })).toMatchObject({
      everyMonths: 3,
      weekOfMonth: 1,
      anchorMonth: 24322,
    });
    expect(JohnDraft.safeParse({ ...john, everyMonths: 60, weekOfMonth: 5 }).success).toBe(true);
    expect(JohnDraft.safeParse({ ...john, everyMonths: 3 }).error?.issues[0].message).toBe("Say which week of the month it lands in.");
  });

  it("keeps effort, cadence and the day in range", () => {
    for (const patch of [
      { points: 0 },
      { points: 21 },
      { everyWeeks: 0 },
      { everyWeeks: 27 },
      { everyMonths: 0, weekOfMonth: 1 },
      { everyMonths: 61, weekOfMonth: 1 },
      { everyMonths: 3, weekOfMonth: 6 },
      { everyMonths: 3 },
      { weekOfMonth: 1 },
      { dueDow: 0 },
      { dueDow: 8 },
      { category: "garden" },
      { name: "x".repeat(61) },
      { groupId: "upstairs" },
      { id: "j1" },
    ]) {
      expect(JohnDraft.safeParse({ ...john, ...patch }).success).toBe(false);
    }
  });
});

describe("DisplayName", () => {
  it("takes 1 to 60 characters, trimmed", () => {
    expect(DisplayName.parse("  Ava  ")).toBe("Ava");
    expect(DisplayName.safeParse(" ").error?.issues[0].message).toBe("Names are 1 to 60 characters.");
    expect(DisplayName.safeParse("x".repeat(61)).error?.issues[0].message).toBe("Names are 1 to 60 characters.");
    expect(DisplayName.safeParse("x".repeat(60)).success).toBe(true);
  });
});

describe("DealRequest", () => {
  it("names the house by its id", () => {
    const houseId = crypto.randomUUID();
    expect(DealRequest.parse({ houseId })).toEqual({ houseId });
    expect(DealRequest.safeParse({ houseId: "flat-3" }).success).toBe(false);
    expect(DealRequest.safeParse({}).success).toBe(false);
  });
});

describe("GroupDraft", () => {
  const ava = crypto.randomUUID();

  it("takes a named group of housemates, tidied", () => {
    expect(GroupDraft.parse({ name: " Upstairs ", members: [ava] })).toEqual({ name: "Upstairs", members: [ava] });
  });

  it("says what’s missing in words", () => {
    expect(GroupDraft.safeParse({ name: "", members: [ava] }).error?.issues[0].message).toBe("Name the group.");
    expect(GroupDraft.safeParse({ name: "Upstairs", members: [] }).error?.issues[0].message).toBe("Pick at least one person.");
    expect(GroupDraft.safeParse({ name: "x".repeat(41), members: [ava] }).success).toBe(false);
    expect(GroupDraft.safeParse({ name: "Upstairs", members: ["ava"] }).success).toBe(false);
  });
});

describe("AwayDraft", () => {
  it("takes local first and last days, and where", () => {
    expect(AwayDraft.parse({ from: "2026-10-26", to: "2026-10-28", note: " Lisbon " })).toEqual({
      from: "2026-10-26",
      to: "2026-10-28",
      note: "Lisbon",
    });
    expect(AwayDraft.parse({ from: "2026-10-26", to: "2026-10-26" })).toEqual({ from: "2026-10-26", to: "2026-10-26" });
  });

  it("asks for each day it’s missing", () => {
    expect(AwayDraft.safeParse({ from: "", to: "2026-10-28" }).error?.issues[0].message).toBe("Pick the first day you’re away.");
    expect(AwayDraft.safeParse({ from: "2026-10-26", to: "28 Oct" }).error?.issues[0].message).toBe("Pick the last day you’re away.");
    expect(AwayDraft.safeParse({ from: "2026-10-26", to: "2026-10-28", note: "x".repeat(61) }).success).toBe(false);
  });
});
