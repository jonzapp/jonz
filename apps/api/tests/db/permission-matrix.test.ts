import { HOUSE_MATRIX, PERMISSION_NAMES, type Permission } from "@app/core";
import { describe, expect, it } from "vitest";

import { signedInUser, type Actor } from "@/tests/support/clients";
import { makeHouse, type House } from "@/tests/support/factories";

/**
 * The whole house matrix, asked of the real database as real people: for
 * every permission, an admin, a member, a family's Parent and Kid, and
 * someone outside the house each get exactly the cell HOUSE_MATRIX
 * (packages/core/src/permission-matrix.ts) says, from can() and from
 * my_permissions. Each operation's own check is tested where it lives.
 */

// The test setup removes each test's houses after it, so each test makes its own.
async function people(): Promise<{ house: House; family: House; outsider: Actor }> {
  return { house: await makeHouse(["Ava", "Ben"]), family: await makeHouse(["Pat", "Kit"], "family"), outsider: await signedInUser("Nosy") };
}

async function canDo(who: Actor, houseId: string, perm: Permission): Promise<boolean> {
  const { data, error } = await who.db.rpc("can", { h: houseId, perm });
  if (error) throw error;
  return data === true;
}

async function holds(who: Actor, houseId: string): Promise<string[]> {
  const { data, error } = await who.db.rpc("my_permissions", { h: houseId });
  if (error) throw error;
  return data ?? [];
}

describe("every permission, every role, in the database", () => {
  it("can() answers each cell of the matrix", async () => {
    const { house, family, outsider } = await people();
    const [ben] = house.members;
    const [kit] = family.members;
    for (const perm of PERMISSION_NAMES) {
      const cell = HOUSE_MATRIX[perm];
      expect(await canDo(house.admin, house.id, perm), `admin ${perm}`).toBe(cell.admin);
      expect(await canDo(ben, house.id, perm), `member ${perm}`).toBe(cell.member);
      expect(await canDo(family.admin, family.id, perm), `Parent ${perm}`).toBe(cell.admin);
      expect(await canDo(kit, family.id, perm), `Kid ${perm}`).toBe(cell.member);
      expect(await canDo(outsider, house.id, perm), `outsider ${perm}`).toBe(false);
      // An admin of one house is nobody in another.
      expect(await canDo(house.admin, family.id, perm), `admin of another house ${perm}`).toBe(false);
    }
  });

  it("my_permissions lists exactly each role's cells", async () => {
    const { house, family, outsider } = await people();
    const want = (role: "admin" | "member") => PERMISSION_NAMES.filter((p) => HOUSE_MATRIX[p][role]).sort();
    expect((await holds(house.admin, house.id)).sort()).toEqual(want("admin"));
    expect((await holds(house.members[0], house.id)).sort()).toEqual(want("member"));
    expect((await holds(family.admin, family.id)).sort()).toEqual(want("admin"));
    expect((await holds(family.members[0], family.id)).sort()).toEqual(want("member"));
    expect(await holds(outsider, house.id)).toEqual([]);
  });
});
