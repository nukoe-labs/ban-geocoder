import { useEffect, useState } from "react";
import { createGeocoder } from "ban-geocoder";
import type { Address } from "ban-geocoder";

const geocoder = createGeocoder();
const MINIMUM_QUERY_LENGTH = 3;
const SUGGESTION_COUNT = 5;

/** The state of an address search: the addresses found, and the last error when the search failed. */
export interface AddressSearchState {
  addresses: Address[];
  error: Error | undefined;
}

/**
 * Searches the addresses that match a text while the user types.
 * Each new text aborts the request of the previous one, so an old answer never replaces a newer one.
 */
export function useAddressSearch(text: string): AddressSearchState {
  const [state, setState] = useState<AddressSearchState>({ addresses: [], error: undefined });

  useEffect(function searchTheText() {
    const controller = new AbortController();
    if (text.trim().length < MINIMUM_QUERY_LENGTH) {
      setState({ addresses: [], error: undefined });
      return undefined;
    }

    /** Shows the addresses found for this text, unless the text changed in the meantime. */
    function showAddresses(addresses: Address[]): void {
      if (controller.signal.aborted) {
        return;
      }
      setState({ addresses, error: undefined });
    }

    /** Shows the error, unless the request was aborted because the text changed. */
    function showError(error: unknown): void {
      if (controller.signal.aborted) {
        return;
      }
      setState({ addresses: [], error: error as Error });
    }

    geocoder.search(text, { autocomplete: true, limit: SUGGESTION_COUNT, signal: controller.signal }).then(showAddresses, showError);

    /** Aborts the request when the text changes or the component goes away. */
    function abortTheSearch(): void {
      controller.abort();
    }
    return abortTheSearch;
  }, [text]);

  return state;
}
