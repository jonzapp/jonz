import { describe, expect, it } from "vitest";

import { HOUSE_MATRIX } from "./permission-matrix";
import { can, HOUSE_ROLES, memberCan, PERMISSION_NAMES } from "./permissions";

describe("the house permission matrix", () => {
  it("has a row for every permission and nothing else", () => {
    expect(Object.keys(HOUSE_MATRIX).sort()).toEqual([...PERMISSION_NAMES].sort());
  });

  for (const permission of PERMISSION_NAMES) {
    it(`${permission}: each role gets exactly its cell`, () => {
      for (const role of HOUSE_ROLES) {
        expect(can(role, permission), `${role} ${permission}`).toBe(HOUSE_MATRIX[permission][role]);
        expect(memberCan({ role }, permission), `${role} ${permission}`).toBe(HOUSE_MATRIX[permission][role]);
      }
      expect(can(null, permission), `outsider ${permission}`).toBe(false);
      expect(memberCan(null, permission), `outsider ${permission}`).toBe(false);
    });
  }
});
