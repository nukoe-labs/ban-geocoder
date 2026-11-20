import { createApiCaller, GeocodingError } from "./http.js";
import type { Address, AddressType, BanFeature, Coordinates, GeocoderOptions, ReverseOptions, SearchOptions } from "./types.js";

export { GeocodingError } from "./http.js";

export type { Address, AddressType, Coordinates, FetchFunction, FetchResponse, GeocoderOptions, GeocodingErrorCode, ReverseOptions, SearchOptions } from "./types.js";

/** The public BAN geocoding service run by IGN. */
export const DEFAULT_BASE_URL = "https://data.geopf.fr/geocodage";
const MINIMUM_QUERY_LENGTH = 3;
const MAXIMUM_QUERY_LENGTH = 200;
const MAXIMUM_LATITUDE = 90;
const MAXIMUM_LONGITUDE = 180;
const OPTIONAL_TEXT_FIELDS = ["housenumber", "street", "postcode", "city", "citycode", "context"] as const;

/** Checks that a search text has the length the BAN API accepts, once trimmed. */
function checkQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length < MINIMUM_QUERY_LENGTH || trimmed.length > MAXIMUM_QUERY_LENGTH) {
    throw new RangeError(`The query must have ${MINIMUM_QUERY_LENGTH} to ${MAXIMUM_QUERY_LENGTH} characters.`);
  }
  return trimmed;
}

/** Checks that coordinates are finite and inside the valid latitude and longitude ranges. */
function checkCoordinates(point: Coordinates): void {
  const latitudeIsValid = Number.isFinite(point.lat) && Math.abs(point.lat) <= MAXIMUM_LATITUDE;
  const longitudeIsValid = Number.isFinite(point.lon) && Math.abs(point.lon) <= MAXIMUM_LONGITUDE;
  if (!latitudeIsValid || !longitudeIsValid) {
    throw new RangeError(`Invalid coordinates: ${point.lat}, ${point.lon}.`);
  }
}

/** Adds the options shared by search and reverse to the query parameters. */
function addCommonParameters(parameters: URLSearchParams, options: { limit?: number; type?: AddressType }): void {
  if (options.limit !== undefined) {
    parameters.set("limit", String(options.limit));
  }
  if (options.type !== undefined) {
    parameters.set("type", options.type);
  }
}

/** Builds the query parameters of a search. */
function buildSearchParameters(query: string, options: SearchOptions): URLSearchParams {
  const parameters = new URLSearchParams({ q: checkQuery(query) });
  addCommonParameters(parameters, options);
  if (options.autocomplete !== undefined) {
    parameters.set("autocomplete", options.autocomplete ? "1" : "0");
  }
  if (options.postcode !== undefined) {
    parameters.set("postcode", options.postcode);
  }
  if (options.citycode !== undefined) {
    parameters.set("citycode", options.citycode);
  }
  if (options.near !== undefined) {
    checkCoordinates(options.near);
    parameters.set("lat", String(options.near.lat));
    parameters.set("lon", String(options.near.lon));
  }
  return parameters;
}

/** Reads a text property of a feature, or undefined when it is missing or not a text. */
function readText(properties: Record<string, unknown>, name: string): string | undefined {
  const value = properties[name];
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

/** Turns one BAN GeoJSON feature into a flat address. */
function toAddress(feature: BanFeature): Address {
  const properties = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;
  const address: Address = {
    id: readText(properties, "id") ?? "",
    label: readText(properties, "label") ?? "",
    score: Number(properties["score"] ?? 0),
    type: (readText(properties, "type") ?? "housenumber") as AddressType,
    coordinates: { lat, lon },
  };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    copyTextField(address, properties, field);
  }
  return address;
}

/** Copies one optional text property onto the address when the feature has it. */
function copyTextField(address: Address, properties: Record<string, unknown>, field: (typeof OPTIONAL_TEXT_FIELDS)[number]): void {
  const value = readText(properties, field);
  if (value !== undefined) {
    address[field] = value;
  }
}

/** Reads the features of a BAN answer, and refuses an answer that is not a GeoJSON feature collection. */
function readFeatures(body: unknown): BanFeature[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) {
    throw new GeocodingError("The geocoding service answered without a list of features.", "format");
  }
  return features as BanFeature[];
}

/** A geocoder bound to one BAN-compatible service (the IGN service, or your own Addok). */
export interface Geocoder {
  search(query: string, options?: SearchOptions): Promise<Address[]>;
  reverse(point: Coordinates, options?: ReverseOptions): Promise<Address[]>;
}

/** Creates a geocoder for the given BAN-compatible service, with a time limit on every call. */
export function createGeocoder(options: GeocoderOptions = {}): Geocoder {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const callApi = createApiCaller(options);

  /** Searches addresses that match a text, best match first. */
  async function search(query: string, searchOptions: SearchOptions = {}): Promise<Address[]> {
    const parameters = buildSearchParameters(query, searchOptions);
    const body = await callApi(`${baseUrl}/search/?${parameters}`, searchOptions.signal);
    return readFeatures(body).map(toAddress);
  }

  /** Finds the addresses closest to a point, closest first. */
  async function reverse(point: Coordinates, reverseOptions: ReverseOptions = {}): Promise<Address[]> {
    checkCoordinates(point);
    const parameters = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) });
    addCommonParameters(parameters, reverseOptions);
    const body = await callApi(`${baseUrl}/reverse/?${parameters}`, reverseOptions.signal);
    return readFeatures(body).map(toAddress);
  }

  return { search, reverse };
}
