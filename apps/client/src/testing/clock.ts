/**
 * The pretend time every client test starts at (jest.config.js sets the
 * clock to it): a Wednesday midday, so a few hours either side stays in the
 * same day, week and month. Tests count from this, never from the real clock.
 */
export const NOW = new Date('2026-11-11T12:00:00Z');

/** An ISO time so many hours from the pretend now (before it when negative). */
export const hoursFromNow = (hours: number): string => new Date(NOW.getTime() + hours * 3_600_000).toISOString();
