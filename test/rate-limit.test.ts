import { describe, expect, it } from "vitest";
import { createGeocoder } from "../src/index.js";
import type { FetchFunction, FetchResponse } from "../src/index.js";

/** Builds a fake fetch that records when each call was sent and answers an empty feature collection. */
function buildTimedFetch(): { fetch: FetchFunction; sentAt: number[] } {
  const sentAt: number[] = [];
  /** Records the time of the call and answers an empty feature collection. */
  async function timedFetch(): Promise<FetchResponse> {
    sentAt.push(Date.now());
    /** Returns an empty feature collection. */
    async function json(): Promise<unknown> {
      return { features: [] };
    }
    return { ok: true, status: 200, json };
  }
  return { fetch: timedFetch, sentAt };
}

/** Gives the time each call waited after the start, less the time its turn was booked for at the given interval. */
function readDelaysAfterTurns(sentAt: number[], startedAt: number, intervalMs: number): number[] {
  const delays: number[] = [];
  for (let index = 0; index < sentAt.length; index += 1) {
    delays.push((sentAt[index] as number) - startedAt - index * intervalMs);
  }
  return delays;
}

/** The time between two requests at 20 requests per second. */
const INTERVAL_AT_20_PER_SECOND_MS = 50;
/** The precision of the timers: a timer may fire up to this much early. */
const TIMER_PRECISION_MS = 5;

describe("rate limit", function rateLimitTests() {
  it("sends each request no earlier than its turn", async function spacesRequests() {
    const fake = buildTimedFetch();
    const geocoder = createGeocoder({ fetch: fake.fetch, maxRequestsPerSecond: 20 });
    const startedAt = Date.now();
    await Promise.all([geocoder.search("paris"), geocoder.search("lyon"), geocoder.reverse({ lat: 48, lon: 2 }), geocoder.search("lille")]);
    expect(fake.sentAt).toHaveLength(4);
    for (const delay of readDelaysAfterTurns(fake.sentAt, startedAt, INTERVAL_AT_20_PER_SECOND_MS)) {
      expect(delay).toBeGreaterThanOrEqual(-TIMER_PRECISION_MS);
    }
  });

  it("sends at once without a limit", async function noLimit() {
    const fake = buildTimedFetch();
    const geocoder = createGeocoder({ fetch: fake.fetch });
    const startedAt = Date.now();
    await Promise.all([geocoder.search("paris"), geocoder.search("lyon"), geocoder.search("lille")]);
    expect(Date.now() - startedAt).toBeLessThan(INTERVAL_AT_20_PER_SECOND_MS);
  });

  it("refuses a limit that is not above zero", function invalidLimit() {
    expect(createGeocoder.bind(undefined, { maxRequestsPerSecond: 0 })).toThrow(RangeError);
    expect(createGeocoder.bind(undefined, { maxRequestsPerSecond: Number.NaN })).toThrow("must be a number above 0, not NaN");
  });

  it("stops waiting for its turn when the caller aborts", async function abortWhileWaiting() {
    const fake = buildTimedFetch();
    const geocoder = createGeocoder({ fetch: fake.fetch, maxRequestsPerSecond: 1 });
    const controller = new AbortController();
    await geocoder.search("paris");
    const pending = geocoder.search("lyon", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted", message: "The call was aborted while waiting for its turn under the rate limit." });
    expect(fake.sentAt).toHaveLength(1);
  });
});
