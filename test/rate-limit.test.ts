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

/** Gives the time between each call and the next one. */
function readGaps(sentAt: number[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < sentAt.length; index += 1) {
    gaps.push((sentAt[index] as number) - (sentAt[index - 1] as number));
  }
  return gaps;
}

/** The time between two requests at 20 requests per second, less 5 ms for the timer precision. */
const MINIMUM_GAP_AT_20_PER_SECOND_MS = 45;

describe("rate limit", function rateLimitTests() {
  it("spaces the requests evenly", async function spacesRequests() {
    const fake = buildTimedFetch();
    const geocoder = createGeocoder({ fetch: fake.fetch, maxRequestsPerSecond: 20 });
    await Promise.all([geocoder.search("paris"), geocoder.search("lyon"), geocoder.reverse({ lat: 48, lon: 2 }), geocoder.search("lille")]);
    expect(fake.sentAt).toHaveLength(4);
    for (const gap of readGaps(fake.sentAt)) {
      expect(gap).toBeGreaterThanOrEqual(MINIMUM_GAP_AT_20_PER_SECOND_MS);
    }
  });

  it("sends at once without a limit", async function noLimit() {
    const fake = buildTimedFetch();
    const geocoder = createGeocoder({ fetch: fake.fetch });
    const startedAt = Date.now();
    await Promise.all([geocoder.search("paris"), geocoder.search("lyon"), geocoder.search("lille")]);
    expect(Date.now() - startedAt).toBeLessThan(MINIMUM_GAP_AT_20_PER_SECOND_MS);
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
