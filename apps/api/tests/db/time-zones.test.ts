import { describe, expect, it } from "vitest";

import { UTC, ZONE_COUNTRY } from "@app/core";

import { signedInUser, visitor } from "@/tests/support/clients";

/**
 * The time zones a house can be set to (20270114090000_time_zones.sql,
 * docs/specs/time-zones.md): every place the database knows and UTC, and
 * none of the old spellings. The app's list of places
 * (packages/core/src/zone-countries.ts) must be ones it knows, or a house
 * could pick a zone its own trigger refuses.
 */
describe("time_zones", () => {
  it("knows every place the app offers, and UTC", async () => {
    const ava = await signedInUser("Ava");
    const { data, error } = await ava.db.rpc("time_zones");
    expect(error).toBeNull();
    const known = new Set(data);
    expect(Object.keys(ZONE_COUNTRY).filter((zone) => !known.has(zone))).toEqual([]);
    expect(known.has(UTC)).toBe(true);
    expect(known.has("Europe/London") && known.has("America/Regina")).toBe(true);
  });

  it("leaves out old spellings and bare offsets", async () => {
    const ava = await signedInUser("Ava");
    const { data } = await ava.db.rpc("time_zones");
    expect(data).not.toContain("US/Central");
    expect(data).not.toContain("GB");
    expect(data!.some((zone) => zone.startsWith("Etc/") || zone.startsWith("posix/"))).toBe(false);
  });

  it("is only for people who are signed in", async () => {
    const { error } = await visitor().rpc("time_zones");
    expect(error?.code).toBe("42501");
  });
});
