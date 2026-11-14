import { weekWindow } from "@app/core";
import { expect, test } from "@playwright/test";

import { admin, cleanUp, dealtHouseInClient } from "./auth";
import { fromNow } from "../tests/support/clock";

// The e2e helper itself: a week dealt on a Saturday evening gives every Sunday
// John a day's grace, which lands them all on one moment. The helper has to
// keep them in the order a test names them, or Next up is a coin toss from
// Saturday 20:00 until the week ends. Checked at a pinned time rather than
// whatever day CI runs; one browser is enough, nothing here is on screen.

const made: string[] = [];
test.afterAll(async () => cleanUp(made));

test("a Saturday-evening deal keeps the test's order", async ({ context }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop-chrome", "no page involved; one run is enough");

  // Saturday 22:00 London of next week (the week ends Monday 00:00), so
  // everyone in the house has joined before the deal's "now".
  const nextWeek = weekWindow(fromNow(7 * 86_400_000), "Europe/London", 1);
  const saturdayEvening = new Date(nextWeek.endsAt.getTime() - 26 * 3_600_000);

  const { userId, weekId } = await dealtHouseInClient(
    context,
    "Hal Helper",
    "Flat 99",
    [
      { name: "Bins out", preset: "bins", dueTime: "20:00" },
      { name: "Clean the bath", preset: "bathroom", needsPhoto: true },
      { name: "Hoover the stairs", preset: "other" },
    ],
    [],
    saturdayEvening,
  );
  made.push(userId);

  const { data } = await admin().from("assignments").select("name, due_at").eq("week_id", weekId).order("due_at");
  expect(data!.map((a) => a.name)).toEqual(["Bins out", "Clean the bath", "Hoover the stairs"]);
  // All three had the grace (a day after the deal), so without the helper they would tie.
  const graced = saturdayEvening.getTime() + 86_400_000;
  expect(data!.map((a) => new Date(a.due_at!).getTime())).toEqual([graced, graced + 1000, graced + 2000]);
});
