/** A point on the map, in WGS 84 degrees. */
export interface Coordinates {
  lat: number;
  lon: number;
}

/** A point in Lambert 93 (EPSG:2154), in meters, as used by French GIS data. */
export interface ProjectedCoordinates {
  x: number;
  y: number;
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
  /** The address without the postcode and the city, for example "8 Boulevard du Port". */
  name?: string;
  /** The importance of the place given by the service, between 0 and 1, useful for ranking. */
  importance?: number;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  citycode?: string;
  context?: string;
  /** The Lambert 93 (EPSG:2154) coordinates, when the service gives them. */
  projected?: ProjectedCoordinates;
}

/** The metadata of an answer, when the service gives it: the query it understood, and the attribution and licence to display. */
export interface AnswerMetadata {
  query?: string;
  attribution?: string;
  licence?: string;
}

/** The addresses of an answer with its metadata. */
export interface GeocodingResult extends AnswerMetadata {
  addresses: Address[];
}

/** The index of the Géoplateforme a search looks in: addresses (the default), cadastral parcels, or points of interest. */
export type SearchIndex = "address" | "parcel" | "poi";

/** A cadastral parcel found in the `parcel` index of the Géoplateforme. */
export interface Parcel {
  /** The 14-character cadastral identifier, for example "95127000BA0187". */
  id: string;
  departmentcode: string;
  municipalitycode: string;
  section: string;
  number: string;
  sheet?: string;
  city?: string;
  score: number;
  coordinates: Coordinates;
}

/** A point of interest (municipality, district, station, place…) found in the `poi` index of the Géoplateforme. */
export interface PointOfInterest {
  /** The main name of the place. */
  toponym: string;
  names: string[];
  categories: string[];
  postcodes: string[];
  citycodes: string[];
  cities: string[];
  score: number;
  coordinates: Coordinates;
}

/** The options of a search. */
export interface SearchOptions {
  /** The index to search in; `address` by default. Use `parcel` or `poi` (Géoplateforme only) to get parcels or points of interest. */
  index?: "address";
  limit?: number;
  autocomplete?: boolean;
  type?: AddressType;
  postcode?: string;
  citycode?: string;
  near?: Coordinates;
  /** Drops the results whose score is below this value (the service scores from 0 to 1); no minimum by default. */
  minScore?: number;
  signal?: AbortSignal;
}

/** The options of a search in the `parcel` index of the Géoplateforme. */
export interface ParcelSearchOptions extends Omit<SearchOptions, "index" | "type" | "autocomplete"> {
  index: "parcel";
}

/** The options of a search in the `poi` index of the Géoplateforme. */
export interface PointOfInterestSearchOptions extends Omit<SearchOptions, "index" | "type"> {
  index: "poi";
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
  /** Only needed by `searchCsv`, whose answer is a CSV text. */
  text?(): Promise<string>;
}

/** The options this library gives to `fetch`: the signal, and for `searchCsv` the POST method and the form. */
export interface FetchInit {
  signal?: AbortSignal;
  method?: "POST";
  body?: FormData;
}

/** The function used to call the API; the global `fetch` by default. */
export type FetchFunction = (input: string, init?: FetchInit) => Promise<FetchResponse>;

/** The options of a CSV batch geocoding. */
export interface CsvSearchOptions {
  /** The name of the column that holds the postcode, to narrow each search. */
  postcode?: string;
  /** The name of the column that holds the INSEE city code, to narrow each search. */
  citycode?: string;
  /** The result columns to add; all of them by default. */
  resultColumns?: string[];
  /** The time limit of this call, instead of the geocoder's `timeoutMs`; a large file takes longer. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** The size and the time to live of the optional in-memory cache of a geocoder. */
export interface CacheOptions {
  /** The number of answers kept; the least recently used one is forgotten first. */
  size: number;
  /** How long an answer is reused, in milliseconds. */
  ttlMs: number;
}

/** The options of a geocoder. */
export interface GeocoderOptions {
  baseUrl?: string;
  fetch?: FetchFunction;
  timeoutMs?: number;
  /** How many times a 429 or 503 answer is tried again; 0 (no retry) by default. */
  retries?: number;
  /** The first pause before a retry, doubled at each new try, unless the answer has a `Retry-After` header; 500 ms by default. */
  retryDelayMs?: number;
  /** Spaces the requests of this geocoder evenly so that at most this number leave each second; no limit by default. */
  maxRequestsPerSecond?: number;
  /** Keeps the answers in memory, keyed by URL, so a repeated query does not call the service again; no cache by default. */
  cache?: CacheOptions;
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
