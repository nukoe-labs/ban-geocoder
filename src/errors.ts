import type { GeocodingErrorCode } from "./types.js";

/** The error thrown when the API cannot be reached, answers an error, or answers something unreadable. */
export class GeocodingError extends Error {
  readonly code: GeocodingErrorCode;
  readonly status: number | undefined;

  /** Builds the error with its message, its kind and, when the API answered, its HTTP status. */
  constructor(message: string, code: GeocodingErrorCode, status?: number) {
    super(message);
    this.name = "GeocodingError";
    this.code = code;
    this.status = status;
  }
}
