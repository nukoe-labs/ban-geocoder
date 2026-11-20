import { describe, expect, it } from "vitest";
import { createGeocoder } from "../src/index.js";

// These tests call the real public service, to detect a change of its API early. They run weekly, not with the unit tests.
const geocoder = createGeocoder({ timeoutMs: 15_000, retries: 3, maxRequestsPerSecond: 5 });
const LIVE_TEST_TIMEOUT_MS = 60_000;

describe("live Géoplateforme API", { timeout: LIVE_TEST_TIMEOUT_MS }, function liveTests() {
  it("finds a known address with its fields", async function searchesKnownAddress() {
    const result = await geocoder.searchWithMeta("8 boulevard du port cergy", { limit: 1 });
    const [best] = result.addresses;
    expect(result.query).toBe("8 boulevard du port cergy");
    expect(best).toMatchObject({ label: "8 Boulevard du Port 95000 Cergy", type: "housenumber", housenumber: "8", street: "Boulevard du Port", postcode: "95000", citycode: "95127", city: "Cergy", name: "8 Boulevard du Port" });
    expect(best?.coordinates.lat).toBeCloseTo(49.0316, 3);
    expect(best?.coordinates.lon).toBeCloseTo(2.0628, 3);
    expect(best?.projected?.x).toBeCloseTo(631468, -1);
    expect(best?.importance).toBeGreaterThan(0);
  });

  it("finds the address of a known point", async function reverseKnownPoint() {
    const [nearest] = await geocoder.reverse({ lat: 49.031624, lon: 2.062821 }, { limit: 1 });
    expect(nearest?.label).toBe("8 Boulevard du Port 95000 Cergy");
  });

  it("finds a known cadastral parcel", async function searchesParcel() {
    const [parcel] = await geocoder.search("95127000BH0101", { index: "parcel", limit: 1 });
    expect(parcel).toMatchObject({ id: "95127000BH0101", departmentcode: "95", municipalitycode: "127", section: "BH", number: "0101", city: "Cergy" });
  });

  it("finds a known point of interest", async function searchesPointOfInterest() {
    const [place] = await geocoder.search("cergy", { index: "poi", limit: 1 });
    expect(place?.toponym).toBe("Cergy");
    expect(place?.citycodes).toContain("95127");
  });

  it("geocodes a CSV file", async function geocodesCsv() {
    const file = new Blob(["adresse,cp\n8 bd du port,95000\n"], { type: "text/csv" });
    const csv = await geocoder.searchCsv(file, ["adresse"], { postcode: "cp", resultColumns: ["result_label"] });
    expect(csv.trim().split(/\r?\n/)).toEqual(["adresse,cp,result_label", "8 bd du port,95000,8 Boulevard du Port 95000 Cergy"]);
  });
});
