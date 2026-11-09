import { HOUSE_MATRIX, OWNER_MATRIX, OWNER_PERMISSION_NAMES, PERMISSION_NAMES, type OwnerPermission, type Permission } from "@app/core";
import { describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

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

/** Someone with an app role in app_owners, who has (or hasn't) given their code this session. */
async function appPerson(name: string, role: "owner" | "support" | null, code: boolean): Promise<Actor> {
  const who = await signedInUser(name);
  if (role) expectOk(await adminClient().from("app_owners").insert({ user_id: who.userId, role }));
  if (code) await passSecondFactor(who);
  return who;
}

async function canApp(who: Actor, perm: OwnerPermission): Promise<boolean> {
  const { data, error } = await who.db.rpc("can_app", { perm });
  if (error) throw error;
  return data === true;
}

/** A notice an hour from now, as save_notice takes it. */
const NOTICE = {
  p_id: null,
  p_kind: "status",
  p_title: "Jonz is slow right now",
  p_body: "Our database host is fixing a problem.",
  p_link_label: null,
  p_link_url: null,
  p_starts_at: "2030-01-01T09:00:00.000Z",
  p_ends_at: null,
};

describe("every app permission, every app role, in the database", () => {
  it("can_app() and my_app_permissions answer each cell of the owner matrix", async () => {
    const owner = await appPerson("Owner", "owner", true);
    const support = await appPerson("Support", "support", true);
    const ownerNoCode = await appPerson("Owner without a code", "owner", false);
    const housemate = await appPerson("Housemate", null, true);
    for (const perm of OWNER_PERMISSION_NAMES) {
      expect(await canApp(owner, perm), `owner ${perm}`).toBe(OWNER_MATRIX[perm].owner);
      expect(await canApp(support, perm), `support ${perm}`).toBe(OWNER_MATRIX[perm].support);
      expect(await canApp(ownerNoCode, perm), `owner without a code ${perm}`).toBe(false);
      expect(await canApp(housemate, perm), `housemate ${perm}`).toBe(false);
    }
    const want = (role: "owner" | "support") => OWNER_PERMISSION_NAMES.filter((p) => OWNER_MATRIX[p][role]).sort();
    expect([...(await owner.db.rpc("my_app_permissions")).data!].sort()).toEqual(want("owner"));
    expect([...(await support.db.rpc("my_app_permissions")).data!].sort()).toEqual(want("support"));
    expect((await ownerNoCode.db.rpc("my_app_permissions")).data).toEqual([]);
  });

  it("owner_status says the role and its permissions only with the code", async () => {
    const support = await appPerson("Support", "support", true);
    const ownerNoCode = await appPerson("Owner without a code", "owner", false);
    expect((await support.db.rpc("owner_status")).data).toMatchObject({ owner: true, mfa: true, role: "support" });
    expect((await ownerNoCode.db.rpc("owner_status")).data).toMatchObject({ owner: true, mfa: false, role: null, permissions: [] });
  });

  it("holds a support helper to their column: reads, but writes no notice", async () => {
    const owner = await appPerson("Owner", "owner", true);
    const support = await appPerson("Support", "support", true);
    expectOk(await support.db.rpc("owner_overview"));
    expectDenied(await support.db.rpc("save_notice", NOTICE));
    expectOk(await owner.db.rpc("save_notice", NOTICE));
  });
});
