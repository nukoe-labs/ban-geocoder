import { describe, expect, it } from "vitest";
import { createAutocomplete, createGeocoder, GeocodingError } from "../src/index.js";
import type { Address, FetchFunction, FetchResponse, SearchOptions } from "../src/index.js";

const CERGY: Address = { id: "95127", label: "Cergy", score: 0.9, type: "municipality", coordinates: { lat: 49.03, lon: 2.06 } };

/** A fake geocoder that records each search and answers after the given time, unless the search is aborted. */
function buildSlowGeocoder(answerAfterMs: number): { search: (text: string, options?: SearchOptions) => Promise<Address[]>; calls: Array<{ text: string; options: SearchOptions | undefined }> } {
  const calls: Array<{ text: string; options: SearchOptions | undefined }> = [];
  /** Records the search and answers one address after a while, or fails when the search is aborted. */
  function search(text: string, options?: SearchOptions): Promise<Address[]> {
    calls.push({ text, options });
    return new Promise(function answerLater(resolve, reject) {
      /** Fails like the geocoder when the search is aborted. */
      function failOnAbort(): void {
        reject(new GeocodingError("The geocoding service could not be reached: aborted", "aborted"));
      }
      setTimeout(resolve, answerAfterMs, [CERGY]);
      options?.signal?.addEventListener("abort", failOnAbort);
    });
  }
  return { search, calls };
}

/** Reads the text of a recorded search. */
function readText(call: { text: string }): string {
  return call.text;
}

describe("createAutocomplete", function autocompleteTests() {
  it("sends one autocompletion search after the quiet time", async function debounces() {
    const geocoder = buildSlowGeocoder(1);
    const autocomplete = createAutocomplete(geocoder, { delayMs: 30, limit: 5 });
    const first = autocomplete.suggest("cer");
    const second = autocomplete.suggest("cerg");
    const third = autocomplete.suggest("cergy");
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    await expect(third).resolves.toEqual([CERGY]);
    expect(geocoder.calls.map(readText)).toEqual(["cergy"]);
    expect(geocoder.calls[0]?.options).toMatchObject({ autocomplete: true, limit: 5 });
  });

  it("cancels the request in progress when a new keystroke comes", async function cancelsPrevious() {
    const geocoder = buildSlowGeocoder(50);
    const autocomplete = createAutocomplete(geocoder, { delayMs: 0 });
    const first = autocomplete.suggest("cer");
    await new Promise(function waitForFirstRequest(resolve) {
      setTimeout(resolve, 10);
    });
    const second = autocomplete.suggest("cergy");
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toEqual([CERGY]);
    expect(geocoder.calls.map(readText)).toEqual(["cer", "cergy"]);
    expect(geocoder.calls[0]?.options?.signal?.aborted).toBe(true);
  });

  it("stops everything on cancel", async function cancelAll() {
    const geocoder = buildSlowGeocoder(1);
    const autocomplete = createAutocomplete(geocoder, { delayMs: 20 });
    const pending = autocomplete.suggest("cergy");
    autocomplete.cancel();
    await expect(pending).resolves.toBeUndefined();
    expect(geocoder.calls).toEqual([]);
  });

  it("passes on the errors of a search that was not replaced", async function passesErrors() {
    /** Answers an HTTP error. */
    async function failingFetch(): Promise<FetchResponse> {
      /** Returns an empty body. */
      async function json(): Promise<unknown> {
        return {};
      }
      return { ok: false, status: 500, json };
    }
    const fetchFunction: FetchFunction = failingFetch;
    const autocomplete = createAutocomplete(createGeocoder({ fetch: fetchFunction }), { delayMs: 0 });
    await expect(autocomplete.suggest("cergy")).rejects.toMatchObject({ code: "http", status: 500 });
  });

  it("refuses a delay that is not a number of milliseconds", function invalidDelay() {
    const geocoder = buildSlowGeocoder(1);
    expect(createAutocomplete.bind(undefined, geocoder, { delayMs: -1 })).toThrow(RangeError);
    expect(createAutocomplete.bind(undefined, geocoder, { delayMs: Number.NaN })).toThrow("not NaN");
  });
});
