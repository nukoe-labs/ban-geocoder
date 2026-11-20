import { GeocodingError } from "./errors.js";
import { pause } from "./pause.js";
import { createRateLimiter } from "./rate-limit.js";
import type { RateLimiter } from "./rate-limit.js";
import type { FetchFunction, FetchInit, FetchResponse, GeocoderOptions, GeocodingErrorCode } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 500;
const BACKOFF_FACTOR = 2;
const MILLISECONDS_PER_SECOND = 1000;
const RETRYABLE_STATUSES = new Set([429, 503]);
const RETRY_AFTER_SECONDS_PATTERN = /^\d+$/;

/** One request to the API: its URL, the caller's signal and, for a form sent with POST, its body and its own time limit. */
export interface ApiRequest {
  url: string;
  signal: AbortSignal | undefined;
  form?: FormData;
  timeoutMs?: number;
}

/** The functions that call the API: a GET answered with JSON, and a POST of a form answered with text. */
export interface ApiClient {
  getJson(url: string, signal: AbortSignal | undefined): Promise<unknown>;
  postForText(request: ApiRequest): Promise<string>;
}

/** The settings every call to the API uses. */
interface ApiSettings {
  fetchFunction: FetchFunction;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  waitForTurn: RateLimiter | undefined;
}

/** Builds the functions that call the API with the time limit, the retry settings and the rate limit of a geocoder. */
export function createApiCaller(options: GeocoderOptions): ApiClient {
  const settings: ApiSettings = {
    fetchFunction: options.fetch ?? (globalThis.fetch as unknown as FetchFunction),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: options.retries ?? 0,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    waitForTurn: createRateLimiter(options.maxRequestsPerSecond),
  };

  /** Calls the API with GET, retrying a busy answer when allowed, and returns its decoded JSON answer. */
  async function getJson(url: string, signal: AbortSignal | undefined): Promise<unknown> {
    const response = await fetchWithRetries({ url, signal }, settings);
    return readJson(response);
  }

  /** Sends a form to the API with POST, retrying a busy answer when allowed, and returns the text of its answer. */
  async function postForText(request: ApiRequest): Promise<string> {
    const response = await fetchWithRetries(request, settings);
    return readBodyText(response);
  }

  return { getJson, postForText };
}

/** Fetches a URL again after a pause while the service answers 429 or 503 and retries are left. */
async function fetchWithRetries(request: ApiRequest, settings: ApiSettings): Promise<FetchResponse> {
  let attempt = 0;
  let response = await fetchOnce(request, settings);
  while (shouldRetry(response, attempt, settings.retries)) {
    const delayMs = readRetryDelay(response, attempt, settings.retryDelayMs);
    await pause(delayMs, request.signal, "The call was aborted while waiting to retry.");
    attempt += 1;
    response = await fetchOnce(request, settings);
  }
  if (!response.ok) {
    throw new GeocodingError(`The geocoding service answered with HTTP ${response.status}.`, "http", response.status);
  }
  return response;
}

/** Tells whether a busy answer (429 or 503) may be fetched again. */
function shouldRetry(response: FetchResponse, attempt: number, retries: number): boolean {
  const serviceIsBusy = RETRYABLE_STATUSES.has(response.status);
  const retriesAreLeft = attempt < retries;
  return serviceIsBusy && retriesAreLeft;
}

/** Gives the pause before the next try: the `Retry-After` header when valid, otherwise an exponential backoff. */
function readRetryDelay(response: FetchResponse, attempt: number, baseDelayMs: number): number {
  const retryAfter = response.headers?.get("retry-after") ?? null;
  const retryAfterMs = parseRetryAfter(retryAfter);
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }
  return baseDelayMs * BACKOFF_FACTOR ** attempt;
}

/** Reads a `Retry-After` header given in seconds or as an HTTP date, in milliseconds from now. */
function parseRetryAfter(retryAfter: string | null): number | undefined {
  if (retryAfter === null) {
    return undefined;
  }
  const trimmed = retryAfter.trim();
  if (RETRY_AFTER_SECONDS_PATTERN.test(trimmed)) {
    return Number(trimmed) * MILLISECONDS_PER_SECOND;
  }
  const retryDate = Date.parse(trimmed);
  if (Number.isNaN(retryDate)) {
    return undefined;
  }
  return Math.max(0, retryDate - Date.now());
}

/** Fetches a URL once, in its turn under the rate limit and with the time limit, and turns a failure to reach the service into a `GeocodingError`. */
async function fetchOnce(request: ApiRequest, settings: ApiSettings): Promise<FetchResponse> {
  const signal = request.signal;
  if (settings.waitForTurn !== undefined) {
    await settings.waitForTurn(signal);
  }
  const timeoutSignal = AbortSignal.timeout(request.timeoutMs ?? settings.timeoutMs);
  const combinedSignal = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
  try {
    return await settings.fetchFunction(request.url, buildRequestInit(request, combinedSignal));
  } catch (error) {
    const code = readFetchFailureCode(timeoutSignal, signal);
    throw new GeocodingError(`The geocoding service could not be reached: ${(error as Error).message}`, code);
  }
}

/** Builds the options given to `fetch`: the signal, and for a form the POST method and its body. */
function buildRequestInit(request: ApiRequest, signal: AbortSignal): FetchInit {
  if (request.form === undefined) {
    return { signal };
  }
  return { signal, method: "POST", body: request.form };
}

/** Tells why the request did not reach the service: its own time limit, the caller's signal, or the network. */
function readFetchFailureCode(timeoutSignal: AbortSignal, callerSignal: AbortSignal | undefined): GeocodingErrorCode {
  if (timeoutSignal.aborted) {
    return "timeout";
  }
  if (callerSignal?.aborted === true) {
    return "aborted";
  }
  return "network";
}

/** Decodes the JSON body of an answer, and reports a body that is not JSON as a format error. */
async function readJson(response: FetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new GeocodingError(`The geocoding service answered something that is not JSON: ${(error as Error).message}`, "format");
  }
}

/** Reads the text body of an answer, and reports a `fetch` that cannot give text as a format error. */
async function readBodyText(response: FetchResponse): Promise<string> {
  if (response.text === undefined) {
    throw new GeocodingError("The fetch function answered without a text() method.", "format");
  }
  return response.text();
}
