import type { Geocoder } from "./index.js";
import type { Address, SearchOptions } from "./types.js";

/** The options of an autocompletion: the quiet time after the last keystroke, and the options of each search. */
export interface AutocompleteOptions extends Omit<SearchOptions, "signal"> {
  /** How long the user must stop typing before the search is sent, in milliseconds. */
  delayMs: number;
}

/** An autocompletion field helper that debounces keystrokes and cancels the previous request. */
export interface Autocomplete {
  /**
   * Searches the text once the user stops typing for `delayMs`.
   * Resolves `undefined` when a newer keystroke or `cancel()` replaced this one.
   */
  suggest(text: string): Promise<Address[] | undefined>;
  /** Cancels the waiting keystroke and the request in progress. */
  cancel(): void;
}

/** Checks that the debounce delay is a finite number of milliseconds, zero or more. */
function checkDelay(delayMs: number): void {
  const isValid = Number.isFinite(delayMs) && delayMs >= 0;
  if (!isValid) {
    throw new RangeError(`delayMs must be a number of milliseconds, 0 or more, not ${delayMs}.`);
  }
}

/** Waits for the quiet time, and resolves true when it ends or false when the signal aborts first. */
function waitForQuietTyping(delayMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(function waitForDelay(resolve) {
    /** Ends the wait so the search can be sent. */
    function finishWaiting(): void {
      signal.removeEventListener("abort", stopWaiting);
      resolve(true);
    }
    /** Stops the wait because a newer keystroke replaced this one. */
    function stopWaiting(): void {
      clearTimeout(timer);
      resolve(false);
    }
    const timer = setTimeout(finishWaiting, delayMs);
    signal.addEventListener("abort", stopWaiting, { once: true });
  });
}

/** Creates an autocompletion helper on a geocoder: it waits for `delayMs` of quiet typing and cancels the previous request. */
export function createAutocomplete(geocoder: Pick<Geocoder, "search">, options: AutocompleteOptions): Autocomplete {
  checkDelay(options.delayMs);
  const { delayMs, ...searchOptions } = options;
  let currentController: AbortController | undefined;

  /** Cancels the waiting keystroke and the request in progress. */
  function cancel(): void {
    currentController?.abort();
    currentController = undefined;
  }

  /** Searches the text after the quiet time, unless a newer keystroke replaces it. */
  async function suggest(text: string): Promise<Address[] | undefined> {
    cancel();
    const controller = new AbortController();
    currentController = controller;
    const isDue = await waitForQuietTyping(delayMs, controller.signal);
    if (!isDue) {
      return undefined;
    }
    return searchUnlessReplaced(geocoder, text, { autocomplete: true, ...searchOptions, signal: controller.signal });
  }

  return { suggest, cancel };
}

/** Sends the search, and resolves undefined instead of failing when a newer keystroke aborted it. */
async function searchUnlessReplaced(geocoder: Pick<Geocoder, "search">, text: string, searchOptions: SearchOptions & { signal: AbortSignal }): Promise<Address[] | undefined> {
  try {
    return await geocoder.search(text, searchOptions);
  } catch (error) {
    if (searchOptions.signal.aborted) {
      return undefined;
    }
    throw error;
  }
}
