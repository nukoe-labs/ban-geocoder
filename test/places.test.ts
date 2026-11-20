import { describe, expect, expectTypeOf, it } from "vitest";
import { createGeocoder, DEFAULT_BASE_URL } from "../src/index.js";
import type { Address, FetchFunction, FetchResponse, Parcel, PointOfInterest } from "../src/index.js";

/** A parcel as the `parcel` index of the Géoplateforme answers it. */
const PARCEL_FEATURE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [2.0627007305250844, 49.03144045829994] },
  properties: {
    id: "95127000BA0187", departmentcode: "95", municipalitycode: "127", oldmunicipalitycode: "000", districtcode: "000",
    section: "BA", sheet: "01", number: "0187", city: "Cergy", distance: 19, score: 0.9981, _type: "parcel",
  },
};

/** A point of interest as the `poi` index of the Géoplateforme answers it. */
const POI_FEATURE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [2.047022, 49.037929] },
  properties: {
    name: ["Cergy"], toponym: "Cergy", category: ["administratif", "commune"], postcode: ["95000"], citycode: ["95127"],
    depcode: ["95"], extrafields: { population: "70906" }, classification: 2, territory: "METROPOLE", score: 0.9909090909090909, _type: "poi",
  },
};

/** Builds a fake fetch that records the called URLs and answers the given features. */
function buildFakeFetch(features: unknown[]): { fetch: FetchFunction; urls: string[] } {
  const urls: string[] = [];
  /** Records the URL and answers the prepared features. */
  async function fakeFetch(input: string): Promise<FetchResponse> {
    urls.push(input);
    /** Returns the prepared feature collection. */
    async function json(): Promise<unknown> {
      return { type: "FeatureCollection", features };
    }
    return { ok: true, status: 200, json };
  }
  return { fetch: fakeFetch, urls };
}

describe("search index", function searchIndexTests() {
  it("searches cadastral parcels", async function searchesParcels() {
    const fake = buildFakeFetch([PARCEL_FEATURE]);
    const parcels = await createGeocoder({ fetch: fake.fetch }).search("95127000BA0187", { index: "parcel", limit: 1 });
    expectTypeOf(parcels).toEqualTypeOf<Parcel[]>();
    expect(parcels).toEqual([{
      id: "95127000BA0187", departmentcode: "95", municipalitycode: "127", section: "BA", number: "0187", sheet: "01", city: "Cergy",
      score: 0.9981, coordinates: { lat: 49.03144045829994, lon: 2.0627007305250844 },
    }]);
    expect(fake.urls).toEqual([`${DEFAULT_BASE_URL}/search/?q=95127000BA0187&index=parcel&limit=1`]);
  });

  it("searches points of interest", async function searchesPointsOfInterest() {
    const fake = buildFakeFetch([POI_FEATURE]);
    const places = await createGeocoder({ fetch: fake.fetch }).search("cergy", { index: "poi", minScore: 0.5 });
    expectTypeOf(places).toEqualTypeOf<PointOfInterest[]>();
    expect(places).toEqual([{
      toponym: "Cergy", names: ["Cergy"], categories: ["administratif", "commune"], postcodes: ["95000"], citycodes: ["95127"], cities: [],
      score: 0.9909090909090909, coordinates: { lat: 49.037929, lon: 2.047022 },
    }]);
    expect(fake.urls).toEqual([`${DEFAULT_BASE_URL}/search/?q=cergy&index=poi`]);
  });

  it("keeps addresses by default and when the index is address", async function searchesAddresses() {
    const fake = buildFakeFetch([]);
    const geocoder = createGeocoder({ fetch: fake.fetch });
    const addresses = await geocoder.search("cergy", { index: "address" });
    expectTypeOf(addresses).toEqualTypeOf<Address[]>();
    expect(fake.urls).toEqual([`${DEFAULT_BASE_URL}/search/?q=cergy&index=address`]);
  });

  it("fills missing properties with neutral values", async function missingProperties() {
    const bareFeature = { geometry: { coordinates: [1, 2] }, properties: { name: "Lieu-dit", city: ["Cergy", 3], score: "high" } };
    const fake = buildFakeFetch([bareFeature]);
    const geocoder = createGeocoder({ fetch: fake.fetch });
    const parcels = await geocoder.search("abc", { index: "parcel" });
    const places = await geocoder.search("abc", { index: "poi" });
    expect(parcels).toEqual([{ id: "", departmentcode: "", municipalitycode: "", section: "", number: "", score: 0, coordinates: { lat: 2, lon: 1 } }]);
    expect(places).toEqual([{ toponym: "", names: ["Lieu-dit"], categories: [], postcodes: [], citycodes: [], cities: ["Cergy"], score: 0, coordinates: { lat: 2, lon: 1 } }]);
  });
});
