import { describe, expect, it } from "vitest";
import { createGeocoder, DEFAULT_BASE_URL, GeocodingError } from "../src/index.js";
import type { FetchFunction } from "../src/index.js";

const CERGY_FEATURE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [2.062821, 49.031624] },
  properties: {
    label: "8 Boulevard du Port 95000 Cergy",
    score: 0.49,
    housenumber: "8",
    id: "95127_1448_00008",
    name: "8 Boulevard du Port",
    postcode: "95000",
    citycode: "95127",
    x: 631468.28,
    y: 6881710.34,
    city: "Cergy",
    context: "95, Val-d'Oise, Île-de-France",
    type: "housenumber",
    street: "Boulevard du Port",
  },
};

/** Builds a fake fetch that records the called URLs and answers the given body with the given status. */
function buildFakeFetch(body: unknown, status = 200): { fetch: FetchFunction; urls: string[] } {
  const urls: string[] = [];
  /** Answers the prepared body, as the API would. */
  async function fakeFetch(input: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
    urls.push(input);
    /** Returns the prepared body. */
    async function json(): Promise<unknown> {
      return body;
    }
    return { ok: status >= 200 && status < 300, status, json };
  }
  return { fetch: fakeFetch, urls };
}

/** A fake fetch that waits until its signal is aborted, then fails like the real fetch. */
async function hangingFetch(_input: string, init?: { signal?: AbortSignal }): Promise<never> {
  return new Promise(function waitForAbort(_resolve, reject) {
    init?.signal?.addEventListener("abort", function rejectOnAbort() {
      reject(new Error("The operation was aborted"));
    });
  });
}

describe("search", function searchTests() {
  it("flattens the GeoJSON answer into addresses", async function flattens() {
    const fake = buildFakeFetch({ type: "FeatureCollection", features: [CERGY_FEATURE] });
    const geocoder = createGeocoder({ fetch: fake.fetch });
    const addresses = await geocoder.search("8 bd du port");
    expect(addresses).toEqual([{
      id: "95127_1448_00008",
      label: "8 Boulevard du Port 95000 Cergy",
      score: 0.49,
      type: "housenumber",
      coordinates: { lat: 49.031624, lon: 2.062821 },
      housenumber: "8",
      street: "Boulevard du Port",
      postcode: "95000",
      city: "Cergy",
      citycode: "95127",
      context: "95, Val-d'Oise, Île-de-France",
      projected: { x: 631468.28, y: 6881710.34 },
    }]);
    expect(fake.urls).toEqual([`${DEFAULT_BASE_URL}/search/?q=8+bd+du+port`]);
  });

  it("sends every search option", async function sendsOptions() {
    const fake = buildFakeFetch({ features: [] });
    const geocoder = createGeocoder({ fetch: fake.fetch, baseUrl: "https://example.org/addok///" });
    await geocoder.search("  rue de la paix ", {
      limit: 3, autocomplete: false, type: "street", postcode: "75002", citycode: "75102", near: { lat: 48.87, lon: 2.33 },
    });
    await geocoder.search("rue de la paix", { autocomplete: true });
    expect(fake.urls).toEqual([
      "https://example.org/addok/search/?q=rue+de+la+paix&limit=3&type=street&autocomplete=0&postcode=75002&citycode=75102&lat=48.87&lon=2.33",
      "https://example.org/addok/search/?q=rue+de+la+paix&autocomplete=1",
    ]);
  });

  it("fills missing properties with neutral values", async function missingProperties() {
    const fake = buildFakeFetch({ features: [{ geometry: { coordinates: [1, 2] }, properties: { city: 42, x: 631468.28, y: "6881710.34" } }] });
    const addresses = await createGeocoder({ fetch: fake.fetch }).search("abc");
    expect(addresses).toEqual([{ id: "", label: "", score: 0, type: "housenumber", coordinates: { lat: 2, lon: 1 } }]);
  });

  it("refuses a query that is too short or too long", async function invalidQuery() {
    const geocoder = createGeocoder({ fetch: buildFakeFetch({ features: [] }).fetch });
    await expect(geocoder.search(" ab ")).rejects.toThrow(RangeError);
    await expect(geocoder.search("x".repeat(201))).rejects.toThrow("3 to 200 characters");
  });

  it("refuses a bias point outside the map", async function invalidBias() {
    const geocoder = createGeocoder({ fetch: buildFakeFetch({ features: [] }).fetch });
    await expect(geocoder.search("paris", { near: { lat: 95, lon: 2 } })).rejects.toThrow("Invalid coordinates");
  });
});

describe("reverse", function reverseTests() {
  it("finds the address of a point", async function findsAddress() {
    const fake = buildFakeFetch({ features: [CERGY_FEATURE] });
    const addresses = await createGeocoder({ fetch: fake.fetch }).reverse({ lat: 49.0316, lon: 2.0628 }, { limit: 1, type: "housenumber" });
    expect(addresses[0]?.label).toBe("8 Boulevard du Port 95000 Cergy");
    expect(fake.urls).toEqual([`${DEFAULT_BASE_URL}/reverse/?lat=49.0316&lon=2.0628&limit=1&type=housenumber`]);
  });

  it("refuses a point that is not a number", async function invalidPoint() {
    const geocoder = createGeocoder({ fetch: buildFakeFetch({ features: [] }).fetch });
    await expect(geocoder.reverse({ lat: 48, lon: Number.NaN })).rejects.toThrow(RangeError);
  });
});

describe("errors", function errorTests() {
  it("reports the HTTP status of a failed answer", async function httpError() {
    const geocoder = createGeocoder({ fetch: buildFakeFetch({}, 503).fetch });
    const failure = geocoder.search("paris");
    await expect(failure).rejects.toBeInstanceOf(GeocodingError);
    await expect(failure).rejects.toMatchObject({ code: "http", status: 503, message: "The geocoding service answered with HTTP 503." });
  });

  it("reports an answer that is not a feature collection", async function unreadableAnswer() {
    const geocoder = createGeocoder({ fetch: buildFakeFetch(null).fetch });
    const failure = geocoder.reverse({ lat: 48, lon: 2 });
    await expect(failure).rejects.toThrow("without a list of features");
    await expect(failure).rejects.toMatchObject({ code: "format" });
  });

  it("reports an answer that is not JSON", async function notJson() {
    /** Answers a body that the JSON decoder refuses. */
    async function htmlFetch(): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
      /** Fails like `Response.json()` on an HTML page. */
      async function json(): Promise<unknown> {
        throw new SyntaxError("Unexpected token '<'");
      }
      return { ok: true, status: 200, json };
    }
    const failure = createGeocoder({ fetch: htmlFetch }).search("paris");
    await expect(failure).rejects.toMatchObject({ code: "format", message: "The geocoding service answered something that is not JSON: Unexpected token '<'" });
  });

  it("gives up after the time limit", async function timeout() {
    const geocoder = createGeocoder({ fetch: hangingFetch, timeoutMs: 20 });
    await expect(geocoder.search("paris")).rejects.toMatchObject({ name: "GeocodingError", code: "timeout", status: undefined });
  });

  it("stops when the caller aborts", async function callerAbort() {
    const controller = new AbortController();
    const geocoder = createGeocoder({ fetch: hangingFetch, timeoutMs: 10_000 });
    const pending = geocoder.search("paris", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow("could not be reached: The operation was aborted");
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("reports a network failure", async function networkFailure() {
    /** Fails like `fetch` when the host cannot be resolved. */
    async function offlineFetch(): Promise<never> {
      throw new TypeError("fetch failed");
    }
    const failure = createGeocoder({ fetch: offlineFetch }).search("paris");
    await expect(failure).rejects.toMatchObject({ code: "network", message: "The geocoding service could not be reached: fetch failed" });
  });

  it("uses the global fetch by default", function defaultFetch() {
    expect(typeof createGeocoder().search).toBe("function");
  });
});
