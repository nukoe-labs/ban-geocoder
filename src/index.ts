import { GeocodingError } from "./errors.js";
import { createLruCache } from "./cache.js";
import { createApiCaller } from "./http.js";
import type { Address, AddressType, AnswerMetadata, BanFeature, GeocodingResult, Coordinates, GeocoderOptions, ReverseOptions, SearchOptions } from "./types.js";

export { isHouseNumber, toPostalLines } from "./address.js";
export type { HouseNumberAddress } from "./address.js";
export { GeocodingError } from "./errors.js";

export type { Address, AddressType, AnswerMetadata, CacheOptions, GeocodingResult, Coordinates, ProjectedCoordinates, FetchFunction, FetchResponse, GeocoderOptions, GeocodingErrorCode, ReverseOptions, SearchOptions } from "./types.js";

/** The public BAN geocoding service run by IGN. */
export const DEFAULT_BASE_URL = "https://data.geopf.fr/geocodage";
const MINIMUM_QUERY_LENGTH = 3;
const MAXIMUM_QUERY_LENGTH = 200;
const MAXIMUM_LATITUDE = 90;
const MAXIMUM_LONGITUDE = 180;
const METADATA_FIELDS = ["query", "attribution", "licence"] as const;
const OPTIONAL_TEXT_FIELDS = ["name", "housenumber", "street", "postcode", "city", "citycode", "context"] as const;

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

/** Reads a number property of a feature, or undefined when it is missing or not a finite number. */
function readNumber(properties: Record<string, unknown>, name: string): number | undefined {
  const value = properties[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

/** Copies the importance of the place onto the address when the feature has it as a number. */
function copyImportance(address: Address, properties: Record<string, unknown>): void {
  const importance = readNumber(properties, "importance");
  if (importance !== undefined) {
    address.importance = importance;
  }
}

/** Copies the Lambert 93 coordinates onto the address when the feature has both `x` and `y`. */
function copyProjectedCoordinates(address: Address, properties: Record<string, unknown>): void {
  const x = readNumber(properties, "x");
  const y = readNumber(properties, "y");
  if (x === undefined || y === undefined) {
    return;
  }
  address.projected = { x, y };
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
  copyImportance(address, properties);
  copyProjectedCoordinates(address, properties);
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

/** The features of an answer with its metadata. */
interface BanAnswer {
  features: BanFeature[];
  metadata: AnswerMetadata;
}

/** Reads the query, the attribution and the licence of an answer, when the service gives them as texts. */
function readMetadata(body: unknown): AnswerMetadata {
  const properties = body as Record<string, unknown>;
  const metadata: AnswerMetadata = {};
  for (const field of METADATA_FIELDS) {
    copyMetadataField(metadata, properties, field);
  }
  return metadata;
}

/** Copies one metadata text of the answer when the service gives it. */
function copyMetadataField(metadata: AnswerMetadata, properties: Record<string, unknown>, field: (typeof METADATA_FIELDS)[number]): void {
  const value = readText(properties, field);
  if (value !== undefined) {
    metadata[field] = value;
  }
}

/** The function that gives the answer of the service for a URL. */
type AnswerReader = (url: string, signal: AbortSignal | undefined) => Promise<BanAnswer>;

/** Builds the function that gets the answer of a URL, from the cache when one is set and still holds it. */
function createAnswerReader(options: GeocoderOptions): AnswerReader {
  const callApi = createApiCaller(options);
  const cache = options.cache === undefined ? undefined : createLruCache<BanAnswer>(options.cache);

  /** Calls the API for a URL, or reuses the answer of the same URL kept in the cache. */
  async function readAnswerOfUrl(url: string, signal: AbortSignal | undefined): Promise<BanAnswer> {
    const cachedAnswer = cache?.get(url);
    if (cachedAnswer !== undefined) {
      return cachedAnswer;
    }
    const body = await callApi(url, signal);
    const answer = { features: readFeatures(body), metadata: readMetadata(body) };
    cache?.set(url, answer);
    return answer;
  }

  return readAnswerOfUrl;
}

/** Checks that a minimum score, when given, is a finite number. */
function checkMinimumScore(minScore: number | undefined): void {
  if (minScore !== undefined && !Number.isFinite(minScore)) {
    throw new RangeError(`minScore must be a finite number, not ${minScore}.`);
  }
}

/** Keeps the addresses whose score reaches the minimum score, or all of them when no minimum is given. */
function keepScoresFrom(addresses: Address[], minScore: number | undefined): Address[] {
  if (minScore === undefined) {
    return addresses;
  }
  const minimumScore = minScore;
  /** Tells whether an address reaches the minimum score. */
  function reachesMinimumScore(address: Address): boolean {
    return address.score >= minimumScore;
  }
  return addresses.filter(reachesMinimumScore);
}

/** A geocoder bound to one BAN-compatible service (the IGN service, or your own Addok). */
export interface Geocoder {
  search(query: string, options?: SearchOptions): Promise<Address[]>;
  reverse(point: Coordinates, options?: ReverseOptions): Promise<Address[]>;
  /** Searches like `search`, and also returns the query, attribution and licence of the answer. */
  searchWithMeta(query: string, options?: SearchOptions): Promise<GeocodingResult>;
  /** Finds addresses like `reverse`, and also returns the attribution and licence of the answer. */
  reverseWithMeta(point: Coordinates, options?: ReverseOptions): Promise<GeocodingResult>;
}

/** Creates a geocoder for the given BAN-compatible service, with a time limit on every call. */
export function createGeocoder(options: GeocoderOptions = {}): Geocoder {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const readAnswerOfUrl = createAnswerReader(options);

  /** Searches addresses that match a text, best match first, with the metadata of the answer. */
  async function searchWithMeta(query: string, searchOptions: SearchOptions = {}): Promise<GeocodingResult> {
    const parameters = buildSearchParameters(query, searchOptions);
    checkMinimumScore(searchOptions.minScore);
    const answer = await readAnswerOfUrl(`${baseUrl}/search/?${parameters}`, searchOptions.signal);
    const addresses = keepScoresFrom(answer.features.map(toAddress), searchOptions.minScore);
    return { addresses, ...answer.metadata };
  }

  /** Finds the addresses closest to a point, closest first, with the metadata of the answer. */
  async function reverseWithMeta(point: Coordinates, reverseOptions: ReverseOptions = {}): Promise<GeocodingResult> {
    checkCoordinates(point);
    const parameters = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) });
    addCommonParameters(parameters, reverseOptions);
    const answer = await readAnswerOfUrl(`${baseUrl}/reverse/?${parameters}`, reverseOptions.signal);
    return { addresses: answer.features.map(toAddress), ...answer.metadata };
  }

  /** Searches addresses that match a text, best match first. */
  async function search(query: string, searchOptions: SearchOptions = {}): Promise<Address[]> {
    const result = await searchWithMeta(query, searchOptions);
    return result.addresses;
  }

  /** Finds the addresses closest to a point, closest first. */
  async function reverse(point: Coordinates, reverseOptions: ReverseOptions = {}): Promise<Address[]> {
    const result = await reverseWithMeta(point, reverseOptions);
    return result.addresses;
  }

  return { search, reverse, searchWithMeta, reverseWithMeta };
}
