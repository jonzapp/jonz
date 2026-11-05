import { describe, expect, it } from "vitest";

import { can, memberCan, PERMISSION_NAMES, PERMISSIONS, ROLE_PERMISSIONS } from "./permissions";

describe("who can do what", () => {
  it("lets an admin do everything", () => {
    for (const p of PERMISSION_NAMES) expect(can("admin", p), p).toBe(true);
  });

  it("lets a member do what everyone may, and none of an admin's moves", () => {
    expect(can("member", "ticks.own")).toBe(true);
    expect(can("member", "away.book")).toBe(true);
    for (const p of ["johns.add", "johns.edit", "johns.remove", "house.settings", "people.remove", "ticks.ok"] as const) {
      expect(can("member", p), p).toBe(false);
    }
  });

  it("lets nobody outside the house do anything", () => {
    expect(can(null, "house.read")).toBe(false);
    expect(memberCan(null, "house.read")).toBe(false);
    expect(memberCan({ role: "member" }, "house.read")).toBe(true);
  });

  it("names only permissions that exist, each once, with words for Ask Jonz", () => {
    for (const list of Object.values(ROLE_PERMISSIONS)) {
      expect(new Set(list).size).toBe(list.length);
      for (const p of list) expect(PERMISSIONS[p]).toBeTruthy();
    }
    for (const p of PERMISSION_NAMES) expect(p).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
});
