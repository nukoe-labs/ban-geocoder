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

/** The function used to call the API; the global `fetch` by default. */
export type FetchFunction = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The options of a geocoder. */
export interface GeocoderOptions {
  baseUrl?: string;
  fetch?: FetchFunction;
  timeoutMs?: number;
}

/** A BAN GeoJSON feature, reduced to the fields this library reads. */
export interface BanFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
}
