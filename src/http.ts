import { GeocodingError } from "./errors.js";
import { pause } from "./pause.js";
import { createRateLimiter } from "./rate-limit.js";
import type { RateLimiter } from "./rate-limit.js";
import type { FetchFunction, FetchResponse, GeocoderOptions, GeocodingErrorCode } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 500;
const BACKOFF_FACTOR = 2;
const MILLISECONDS_PER_SECOND = 1000;
const RETRYABLE_STATUSES = new Set([429, 503]);
const RETRY_AFTER_SECONDS_PATTERN = /^\d+$/;

/** The function that calls the API for a URL and returns its decoded JSON answer. */
export type ApiCaller = (url: string, signal: AbortSignal | undefined) => Promise<unknown>;

/** The settings every call to the API uses. */
interface ApiSettings {
  fetchFunction: FetchFunction;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  waitForTurn: RateLimiter | undefined;
}

/** Builds the function that calls the API with the time limit, the retry settings and the rate limit of a geocoder. */
export function createApiCaller(options: GeocoderOptions): ApiCaller {
  const settings: ApiSettings = {
    fetchFunction: options.fetch ?? (globalThis.fetch as unknown as FetchFunction),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: options.retries ?? 0,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    waitForTurn: createRateLimiter(options.maxRequestsPerSecond),
  };

  /** Calls the API, retrying a busy answer when allowed, and returns its decoded JSON answer. */
  async function callApi(url: string, signal: AbortSignal | undefined): Promise<unknown> {
    const response = await fetchWithRetries(url, settings, signal);
    return readJson(response);
  }

  return callApi;
}

/** Fetches a URL again after a pause while the service answers 429 or 503 and retries are left. */
async function fetchWithRetries(url: string, settings: ApiSettings, signal: AbortSignal | undefined): Promise<FetchResponse> {
  let attempt = 0;
  let response = await fetchOnce(url, settings, signal);
  while (shouldRetry(response, attempt, settings.retries)) {
    const delayMs = readRetryDelay(response, attempt, settings.retryDelayMs);
    await pause(delayMs, signal, "The call was aborted while waiting to retry.");
    attempt += 1;
    response = await fetchOnce(url, settings, signal);
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
async function fetchOnce(url: string, settings: ApiSettings, signal: AbortSignal | undefined): Promise<FetchResponse> {
  if (settings.waitForTurn !== undefined) {
    await settings.waitForTurn(signal);
  }
  const timeoutSignal = AbortSignal.timeout(settings.timeoutMs);
  const combinedSignal = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
  try {
    return await settings.fetchFunction(url, { signal: combinedSignal });
  } catch (error) {
    const code = readFetchFailureCode(timeoutSignal, signal);
    throw new GeocodingError(`The geocoding service could not be reached: ${(error as Error).message}`, code);
  }
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
