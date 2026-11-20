import { GeocodingError } from "./errors.js";

/** Waits for a delay, and stops at once with an `aborted` error carrying the given message when the signal aborts. */
export function pause(delayMs: number, signal: AbortSignal | undefined, abortMessage: string): Promise<void> {
  return new Promise(function waitForDelay(resolve, reject) {
    /** Ends the pause and stops listening to the caller's signal. */
    function finishWaiting(): void {
      signal?.removeEventListener("abort", stopWaiting);
      resolve();
    }
    /** Cancels the pause and reports the caller's abort. */
    function stopWaiting(): void {
      clearTimeout(timer);
      reject(new GeocodingError(abortMessage, "aborted"));
    }
    const timer = setTimeout(finishWaiting, delayMs);
    signal?.addEventListener("abort", stopWaiting, { once: true });
  });
}
