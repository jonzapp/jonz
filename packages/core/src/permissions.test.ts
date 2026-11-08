import { describe, expect, it } from "vitest";

import { can, memberCan, PERMISSION_NAMES, PERMISSIONS, permissionLevel, permissionResource, ROLE_PERMISSIONS } from "./permissions";

describe("who can do what", () => {
  it("lets an admin do everything", () => {
    for (const p of PERMISSION_NAMES) expect(can("admin", p), p).toBe(true);
  });

  it("lets a member do what everyone may, and none of an admin's moves", () => {
    expect(can("member", "ticks:write_own")).toBe(true);
    expect(can("member", "away:write_own")).toBe(true);
    for (const p of ["johns:write", "house:write", "members:write", "ticks:write", "history:write"] as const) {
      expect(can("member", p), p).toBe(false);
    }
  });

  it("lets nobody outside the house do anything", () => {
    expect(can(null, "house:read")).toBe(false);
    expect(memberCan(null, "house:read")).toBe(false);
    expect(memberCan({ role: "member" }, "house:read")).toBe(true);
  });

  it("names only permissions that exist, each once, with words for Ask Jonz", () => {
    for (const list of Object.values(ROLE_PERMISSIONS)) {
      expect(new Set(list).size).toBe(list.length);
      for (const p of list) expect(PERMISSIONS[p]).toBeTruthy();
    }
    for (const p of PERMISSION_NAMES) expect(p).toMatch(/^[a-z_]+:(read|write_own|write)$/);
  });

  it("gives a role the lower levels of anything it may write, as Stripe does", () => {
    for (const [role, list] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of list) {
        const resource = permissionResource(p);
        if (permissionLevel(p) !== "write") continue;
        for (const lower of [`${resource}:write_own`, `${resource}:read`]) {
          if (lower in PERMISSIONS) expect(list, `${role} ${p}`).toContain(lower);
        }
      }
    }
  });
});
