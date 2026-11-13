/**
 * The one place the database and browser tests read the real clock.
 *
 * Unit and client tests run at a pretend time. These can't: Postgres stamps
 * and compares rows with its own now(), so a test that says "due an hour
 * ago" has to count from the same clock. Count from here, pass the time on
 * to the engine as its `now`, and never assert on a boundary the real clock
 * could cross mid-run (midnight, a week's end): deal next week instead, as
 * tests/db/kid-profiles.test.ts does.
 */
export function rightNow(): Date {
  return new Date();
}

/** A time so many milliseconds from now (before it when negative). */
export function fromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}
