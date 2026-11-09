import { describe, expect, it } from "vitest";

import { OWNER_PERMISSION_NAMES, OWNER_ROLES, ownerCan } from "./owner-moves";
import { HOUSE_MATRIX, OWNER_MATRIX } from "./permission-matrix";
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

describe("the owner permission matrix", () => {
  it("has a row for every app permission and nothing else", () => {
    expect(Object.keys(OWNER_MATRIX).sort()).toEqual([...OWNER_PERMISSION_NAMES].sort());
  });

  for (const permission of OWNER_PERMISSION_NAMES) {
    it(`${permission}: each app role gets exactly its cell`, () => {
      for (const role of OWNER_ROLES) expect(ownerCan(role, permission), `${role} ${permission}`).toBe(OWNER_MATRIX[permission][role]);
      expect(ownerCan(null, permission), `nobody ${permission}`).toBe(false);
    });
  }
});
