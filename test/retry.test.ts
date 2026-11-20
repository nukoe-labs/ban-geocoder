import { describe, expect, it } from "vitest";
import { createGeocoder } from "../src/index.js";
import type { FetchFunction, FetchResponse } from "../src/index.js";

/** One prepared answer of the fake service: its HTTP status and its optional `Retry-After` header. */
interface PreparedAnswer {
  status: number;
  retryAfter?: string;
}

/** Builds one fake answer with an empty feature collection. */
function buildResponse(answer: PreparedAnswer): FetchResponse {
  /** Returns an empty feature collection. */
  async function json(): Promise<unknown> {
    return { features: [] };
  }
  /** Returns the prepared `Retry-After` header, and nothing for any other header. */
  function get(name: string): string | null {
    if (name === "retry-after" && answer.retryAfter !== undefined) {
      return answer.retryAfter;
    }
    return null;
  }
  return { ok: answer.status === 200, status: answer.status, json, headers: { get } };
}

/** Builds a fake fetch that gives the prepared answers in order and counts the calls. */
function buildSequenceFetch(answers: PreparedAnswer[]): { fetch: FetchFunction; calls: () => number } {
  let callCount = 0;
  /** Gives the next prepared answer, or the last one again when none is left. */
  async function sequenceFetch(): Promise<FetchResponse> {
    const answer = answers[Math.min(callCount, answers.length - 1)] as PreparedAnswer;
    callCount += 1;
    return buildResponse(answer);
  }
  /** Tells how many times the fake fetch was called. */
  function calls(): number {
    return callCount;
  }
  return { fetch: sequenceFetch, calls };
}

describe("retry", function retryTests() {
  it("does not retry by default", async function noRetryByDefault() {
    const fake = buildSequenceFetch([{ status: 503 }, { status: 200 }]);
    await expect(createGeocoder({ fetch: fake.fetch }).search("paris")).rejects.toMatchObject({ code: "http", status: 503 });
    expect(fake.calls()).toBe(1);
  });

  it("retries 429 and 503 answers until one succeeds", async function retriesUntilSuccess() {
    const fake = buildSequenceFetch([{ status: 429 }, { status: 503 }, { status: 200 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 3, retryDelayMs: 1 });
    await expect(geocoder.search("paris")).resolves.toEqual([]);
    expect(fake.calls()).toBe(3);
  });

  it("gives up after the allowed retries", async function givesUp() {
    const fake = buildSequenceFetch([{ status: 429 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 3, retryDelayMs: 1 });
    await expect(geocoder.reverse({ lat: 48, lon: 2 })).rejects.toMatchObject({ code: "http", status: 429 });
    expect(fake.calls()).toBe(4);
  });

  it("does not retry other errors", async function otherErrors() {
    const fake = buildSequenceFetch([{ status: 500 }, { status: 200 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 3, retryDelayMs: 1 });
    await expect(geocoder.search("paris")).rejects.toMatchObject({ status: 500 });
    expect(fake.calls()).toBe(1);
  });

  it("doubles the pause at each try", async function exponentialBackoff() {
    const fake = buildSequenceFetch([{ status: 503 }, { status: 503 }, { status: 200 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 3, retryDelayMs: 40 });
    const startedAt = Date.now();
    await geocoder.search("paris");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(110);
  });

  it("honours a Retry-After header given in seconds", async function retryAfterSeconds() {
    const fake = buildSequenceFetch([{ status: 429, retryAfter: " 0 " }, { status: 200 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 1, retryDelayMs: 60_000 });
    await expect(geocoder.search("paris")).resolves.toEqual([]);
    expect(fake.calls()).toBe(2);
  });

  it("honours a Retry-After header given as a past HTTP date", async function retryAfterDate() {
    const fake = buildSequenceFetch([{ status: 503, retryAfter: "Wed, 21 Oct 2015 07:28:00 GMT" }, { status: 200 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 1, retryDelayMs: 60_000 });
    await expect(geocoder.search("paris")).resolves.toEqual([]);
  });

  it("falls back to the backoff when Retry-After is unreadable", async function unreadableRetryAfter() {
    const fake = buildSequenceFetch([{ status: 503, retryAfter: "soon" }, { status: 200 }]);
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 1, retryDelayMs: 1 });
    await expect(geocoder.search("paris")).resolves.toEqual([]);
  });

  it("retries an answer without headers", async function noHeaders() {
    /** Returns an empty feature collection. */
    async function json(): Promise<unknown> {
      return { features: [] };
    }
    const answers: FetchResponse[] = [{ ok: false, status: 503, json }, { ok: true, status: 200, json }];
    /** Gives the prepared answers without headers, in order. */
    async function bareFetch(): Promise<FetchResponse> {
      return answers.shift() as FetchResponse;
    }
    const controller = new AbortController();
    const geocoder = createGeocoder({ fetch: bareFetch, retries: 1, retryDelayMs: 1 });
    await expect(geocoder.search("paris", { signal: controller.signal })).resolves.toEqual([]);
  });

  it("stops waiting when the caller aborts", async function abortDuringPause() {
    const fake = buildSequenceFetch([{ status: 503 }, { status: 200 }]);
    const controller = new AbortController();
    const geocoder = createGeocoder({ fetch: fake.fetch, retries: 1, retryDelayMs: 60_000 });
    const pending = geocoder.search("paris", { signal: controller.signal });
    setTimeout(controller.abort.bind(controller), 10);
    await expect(pending).rejects.toMatchObject({ code: "aborted", message: "The call was aborted while waiting to retry." });
    expect(fake.calls()).toBe(1);
  });
});
