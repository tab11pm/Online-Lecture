import { DateTime } from 'luxon';

const TIMEZONE = 'Asia/Krasnoyarsk';

/** Creates a wall-clock-advanced fake-session clock anchored at local noon. */
export function createFakeClock(
  readWallClock: () => Date = () => new Date(),
): () => Date {
  const baselineMs = readWallClock().getTime();
  const startupDate = DateTime.fromMillis(baselineMs, { zone: TIMEZONE });
  const anchorMs = startupDate
    .set({ hour: 12, minute: 0, second: 0, millisecond: 0 })
    .toMillis();

  return () => new Date(anchorMs + (readWallClock().getTime() - baselineMs));
}
