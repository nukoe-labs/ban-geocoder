import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeocoder } from "../src/index.js";
import type { FetchFunction, FetchResponse } from "../src/index.js";

/** Builds a fake fetch that records the called URLs and answers the given bodies in order, the last one again when none is left. */
function buildCountingFetch(bodies: unknown[]): { fetch: FetchFunction; urls: string[] } {
  const urls: string[] = [];
  /** Records the URL and answers the next prepared body. */
  async function countingFetch(input: string): Promise<FetchResponse> {
    const body = bodies[Math.min(urls.length, bodies.length - 1)];
    urls.push(input);
    /** Returns the prepared body. */
    async function json(): Promise<unknown> {
      return body;
    }
    return { ok: true, status: 200, json };
  }
  return { fetch: countingFetch, urls };
}

const EMPTY_ANSWER = { features: [] };
const ONE_HOUR_MS = 3_600_000;

describe("cache", function cacheTests() {
  afterEach(function restoreClock() {
    vi.useRealTimers();
  });

  it("calls the service every time by default", async function noCacheByDefault() {
    const fake = buildCountingFetch([EMPTY_ANSWER]);
    const geocoder = createGeocoder({ fetch: fake.fetch });
    await geocoder.search("paris");
    await geocoder.search("paris");
    expect(fake.urls).toHaveLength(2);
  });

  it("reuses the answer of the same URL", async function reusesAnswer() {
    const fake = buildCountingFetch([EMPTY_ANSWER]);
    const geocoder = createGeocoder({ fetch: fake.fetch, cache: { size: 10, ttlMs: ONE_HOUR_MS } });
    await geocoder.search("paris");
    await geocoder.search("paris");
    await geocoder.search("paris", { limit: 1 });
    await geocoder.reverse({ lat: 48, lon: 2 });
    await geocoder.reverse({ lat: 48, lon: 2 });
    expect(fake.urls).toEqual([
      "https://data.geopf.fr/geocodage/search/?q=paris",
      "https://data.geopf.fr/geocodage/search/?q=paris&limit=1",
      "https://data.geopf.fr/geocodage/reverse/?lat=48&lon=2",
    ]);
  });

  it("calls the service again once the time to live is over", async function expires() {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fake = buildCountingFetch([EMPTY_ANSWER]);
    const geocoder = createGeocoder({ fetch: fake.fetch, cache: { size: 10, ttlMs: ONE_HOUR_MS } });
    await geocoder.search("paris");
    vi.advanceTimersByTime(ONE_HOUR_MS - 1);
    await geocoder.search("paris");
    vi.advanceTimersByTime(1);
    await geocoder.search("paris");
    expect(fake.urls).toHaveLength(2);
  });

  it("forgets the least recently used answer when full", async function evictsLeastRecentlyUsed() {
    const fake = buildCountingFetch([EMPTY_ANSWER]);
    const geocoder = createGeocoder({ fetch: fake.fetch, cache: { size: 2, ttlMs: ONE_HOUR_MS } });
    await geocoder.search("aaa");
    await geocoder.search("bbb");
    await geocoder.search("aaa");
    await geocoder.search("ccc");
    await geocoder.search("aaa");
    await geocoder.search("bbb");
    expect(fake.urls.map(decodeURIComponent)).toEqual([
      "https://data.geopf.fr/geocodage/search/?q=aaa",
      "https://data.geopf.fr/geocodage/search/?q=bbb",
      "https://data.geopf.fr/geocodage/search/?q=ccc",
      "https://data.geopf.fr/geocodage/search/?q=bbb",
    ]);
  });

  it("does not keep an unreadable answer", async function skipsUnreadableAnswer() {
    const fake = buildCountingFetch([null, EMPTY_ANSWER]);
    const geocoder = createGeocoder({ fetch: fake.fetch, cache: { size: 10, ttlMs: ONE_HOUR_MS } });
    await expect(geocoder.search("paris")).rejects.toMatchObject({ code: "format" });
    await expect(geocoder.search("paris")).resolves.toEqual([]);
    expect(fake.urls).toHaveLength(2);
  });

  it("refuses a size or a time to live that is not above zero", function invalidOptions() {
    expect(createGeocoder.bind(undefined, { cache: { size: 0, ttlMs: ONE_HOUR_MS } })).toThrow(RangeError);
    expect(createGeocoder.bind(undefined, { cache: { size: 1.5, ttlMs: ONE_HOUR_MS } })).toThrow(RangeError);
    expect(createGeocoder.bind(undefined, { cache: { size: 10, ttlMs: 0 } })).toThrow("not 10 and 0");
  });
});
