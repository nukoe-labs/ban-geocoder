/** A point on the map, in WGS 84 degrees. */
export interface Coordinates {
  lat: number;
  lon: number;
}

/** The kinds of result the BAN API can return. */
export type AddressType = "housenumber" | "street" | "locality" | "municipality";

/** One address found by the BAN API, flattened from its GeoJSON feature. */
export interface Address {
  id: string;
  label: string;
  score: number;
  type: AddressType;
  coordinates: Coordinates;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  citycode?: string;
  context?: string;
}

/** The options of a search. */
export interface SearchOptions {
  limit?: number;
  autocomplete?: boolean;
  type?: AddressType;
  postcode?: string;
  citycode?: string;
  near?: Coordinates;
  signal?: AbortSignal;
}

/** The options of a reverse geocoding. */
export interface ReverseOptions {
  limit?: number;
  type?: AddressType;
  signal?: AbortSignal;
}

/** The part of a `fetch` answer this library reads; `headers` is only needed for the `Retry-After` header. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** The function used to call the API; the global `fetch` by default. */
export type FetchFunction = (input: string, init?: { signal?: AbortSignal }) => Promise<FetchResponse>;

/** The options of a geocoder. */
export interface GeocoderOptions {
  baseUrl?: string;
  fetch?: FetchFunction;
  timeoutMs?: number;
  /** How many times a 429 or 503 answer is tried again; 0 (no retry) by default. */
  retries?: number;
  /** The first pause before a retry, doubled at each new try, unless the answer has a `Retry-After` header; 500 ms by default. */
  retryDelayMs?: number;
}

/**
 * The kind of a `GeocodingError`: the time limit ran out (`timeout`), the caller aborted (`aborted`),
 * the network failed (`network`), the service answered an HTTP error (`http`), or its answer is unreadable (`format`).
 */
export type GeocodingErrorCode = "timeout" | "aborted" | "network" | "http" | "format";

/** A BAN GeoJSON feature, reduced to the fields this library reads. */
export interface BanFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
}
