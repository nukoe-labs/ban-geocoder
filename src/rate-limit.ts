import { pause } from "./pause.js";

const MILLISECONDS_PER_SECOND = 1000;

/** The function every request awaits before it is sent, so that requests stay under the rate limit. */
export type RateLimiter = (signal: AbortSignal | undefined) => Promise<void>;

/** Checks that a rate limit is a finite number above zero. */
function checkRequestsPerSecond(maxRequestsPerSecond: number): void {
  const isValid = Number.isFinite(maxRequestsPerSecond) && maxRequestsPerSecond > 0;
  if (!isValid) {
    throw new RangeError(`maxRequestsPerSecond must be a number above 0, not ${maxRequestsPerSecond}.`);
  }
}

/** Builds the rate limiter of a geocoder, which spaces requests evenly; there is none when no limit is set. */
export function createRateLimiter(maxRequestsPerSecond: number | undefined): RateLimiter | undefined {
  if (maxRequestsPerSecond === undefined) {
    return undefined;
  }
  checkRequestsPerSecond(maxRequestsPerSecond);
  const intervalMs = MILLISECONDS_PER_SECOND / maxRequestsPerSecond;
  let nextTurnAt = 0;

  /** Books the next free turn for a request and waits until it comes. */
  async function waitForTurn(signal: AbortSignal | undefined): Promise<void> {
    const now = Date.now();
    const turnAt = Math.max(now, nextTurnAt);
    nextTurnAt = turnAt + intervalMs;
    await pause(turnAt - now, signal, "The call was aborted while waiting for its turn under the rate limit.");
  }

  return waitForTurn;
}
