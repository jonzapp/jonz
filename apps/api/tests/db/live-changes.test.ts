import { describe, expect, it } from "vitest";

import { adminClient, signedInUser, type Db } from "@/tests/support/clients";
import { addJohns, deal, makeHouse, thisWeek } from "@/tests/support/factories";

/**
 * Live updates (migration live_changes): each change to what a house's
 * screens show is noted for the API's streams, and only a member can ask
 * what their house's newest change is.
 */

const db = adminClient();
const NOW = new Date("2026-01-07T12:00:00Z");

const since = async (client: Db, houseId: string, after?: number) => {
  const { data, error } = await client.rpc("house_live_since" as never, { p_house: houseId, ...(after === undefined ? {} : { p_after: after }) } as never);
  if (error) throw error;
  return (data as unknown as { latest: number | string | null }).latest;
};

describe("live_changes", () => {
  it("notes a dealt week for the house, and tells a member its newest change", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek(NOW));
    await deal(house.id, thisWeek(NOW), NOW);

    const { data: rows } = await db.from("live_changes" as never).select("id").eq("house_id", house.id).order("id");
    const ids = (rows as unknown as { id: number | string }[]).map((row) => Number(row.id));
    expect(ids.length).toBeGreaterThan(0);
    const newest = ids.at(-1)!;

    expect(Number(await since(house.admin.db, house.id))).toBe(newest);
    expect(Number(await since(house.members[0].db, house.id, ids[0] - 1))).toBe(newest);
    // Nothing since the newest: null, and the app reads nothing more.
    expect(await since(house.admin.db, house.id, newest)).toBeNull();
  });

  it("tells someone outside the house nothing, and nobody reads the notes straight", async () => {
    const house = await makeHouse(["Ava", "Ben"]);
    await addJohns(house.id, [{ name: "Bins" }], thisWeek(NOW));
    await deal(house.id, thisWeek(NOW), NOW);
    const stranger = await signedInUser("Zed");
    expect(await since(stranger.db, house.id)).toBeNull();

    const { data, error } = await house.admin.db.from("live_changes" as never).select("id");
    expect(error ?? data).toSatisfy((answer: unknown) => answer !== null && (!Array.isArray(answer) || answer.length === 0));
  });
});
