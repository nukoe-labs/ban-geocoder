# ban-geocoder

[![CI](https://github.com/nukoe-labs/ban-geocoder/actions/workflows/ci.yml/badge.svg)](https://github.com/nukoe-labs/ban-geocoder/actions/workflows/ci.yml)
![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, typed client for French address search and reverse geocoding with the **BAN** API
(Base Adresse Nationale), or any self-hosted [Addok](https://github.com/addok/addok) that speaks the same format.

- Flat, typed results instead of raw GeoJSON: `label`, `coordinates`, `postcode`, `city`…
- A time limit on every call, and cancellation with an `AbortSignal` (ideal for autocompletion).
- Input checked before any request: query length, latitude and longitude ranges.
- No dependency: it uses the `fetch` of Node.js 20+ or the browser, and accepts your own.

It comes from [YovWay](https://yov.me/way), a web GPS that runs its own Addok server.

## Install

```sh
npm install github:nukoe-labs/ban-geocoder
```

## Usage

```ts
import { createGeocoder } from "ban-geocoder";

const geocoder = createGeocoder(); // the public IGN service, https://data.geopf.fr/geocodage

const [best] = await geocoder.search("8 bd du port cergy", { limit: 1 });
// best.label       -> "8 Boulevard du Port 95000 Cergy"
// best.coordinates -> { lat: 49.031624, lon: 2.062821 }
// best.name        -> "8 Boulevard du Port" (the address without the city)
// best.importance  -> 0.67985
// best.projected   -> { x: 631468.28, y: 6881710.34 } (Lambert 93, EPSG:2154, when the service gives it)

const [nearest] = await geocoder.reverse({ lat: 48.8584, lon: 2.2945 }, { limit: 1 });
// nearest.label    -> "Avenue Anatole France 75007 Paris"
```

### Parcels and points of interest (Géoplateforme)

The IGN service also searches cadastral parcels and points of interest, each with its own result type:

```ts
const [parcel] = await geocoder.search("95127000BA0187", { index: "parcel", limit: 1 });
// parcel.section -> "BA", parcel.number -> "0187", parcel.city -> "Cergy"

const [place] = await geocoder.search("cergy", { index: "poi", limit: 1 });
// place.toponym -> "Cergy", place.categories -> ["administratif", "commune"]
```

A self-hosted Addok only has addresses: leave `index` out (it defaults to `address`).

### Thousands of addresses from a CSV file

`searchCsv` sends a whole CSV file to the `/search/csv/` endpoint and returns the CSV text with the result columns added:

```ts
import { readFile } from "node:fs/promises";

const file = new Blob([await readFile("addresses.csv")], { type: "text/csv" });
const geocoded = await geocoder.searchCsv(file, ["number", "street", "city"], {
  postcode: "postcode",                          // optional column that narrows each search
  resultColumns: ["result_label", "result_score"], // all result columns by default
  timeoutMs: 120_000,                            // a large file takes longer than one search
});
```

The IGN service has this endpoint; a self-hosted Addok has it only when its CSV plugin is enabled (otherwise it answers an HTTP error).

### Helpers

```ts
import { distanceTo, isHouseNumber, toPostalLines } from "ban-geocoder";

toPostalLines(best); // ["8 Boulevard du Port", "95000 CERGY"]
distanceTo(best, { lat: 49.0365, lon: 2.0761 }); // meters (haversine), to sort or filter results around the user

if (isHouseNumber(best)) {
  best.housenumber; // string, no longer string | undefined
  best.street;      // string
}
```

### Attribution and licence

`searchWithMeta` and `reverseWithMeta` return the addresses with the metadata of the answer, when the service gives it,
so an app can display the attribution:

```ts
const result = await geocoder.searchWithMeta("8 bd du port cergy");
// result.addresses   -> the same addresses as search()
// result.query       -> "8 bd du port cergy"
// result.attribution -> "BAN", result.licence -> "ETALAB-2.0" (an Addok server gives them; the Géoplateforme only gives query)
```

### Autocompletion that cancels the previous request

`createAutocomplete` waits until the user stops typing for `delayMs`, then searches with `autocomplete: true`
and cancels the request of the previous keystroke. A keystroke replaced by a newer one resolves `undefined`.

```ts
import { createAutocomplete } from "ban-geocoder";

const autocomplete = createAutocomplete(geocoder, { delayMs: 250, limit: 5 });

input.addEventListener("input", async function showSuggestions() {
  const addresses = await autocomplete.suggest(input.value);
  if (addresses !== undefined) {
    render(addresses);
  }
});
// autocomplete.cancel() stops the waiting keystroke and the request in progress.
```

Any other search option (`limit`, `type`, `near`…) is passed to each search. A text shorter than 3 characters is refused
with a `RangeError`, as with `search`.

### In a browser without a bundler

A plain HTML page can import the ES module from a CDN. [esm.sh](https://esm.sh) builds it from the GitHub sources;
pin a commit or a tag instead of `main` in production.

```html
<input id="address" autocomplete="off">
<ul id="suggestions"></ul>
<script type="module">
  import { createAutocomplete, createGeocoder } from "https://esm.sh/gh/nukoe-labs/ban-geocoder@main/src/index.ts";

  const input = document.getElementById("address");
  const list = document.getElementById("suggestions");
  const autocomplete = createAutocomplete(createGeocoder(), { delayMs: 250, limit: 5 });

  function toListItem(address) {
    const item = document.createElement("li");
    item.textContent = address.label;
    return item;
  }

  input.addEventListener("input", async function showSuggestions() {
    if (input.value.trim().length < 3) {
      list.replaceChildren();
      return;
    }
    const addresses = await autocomplete.suggest(input.value);
    if (addresses !== undefined) {
      list.replaceChildren(...addresses.map(toListItem));
    }
  });
</script>
```

The complete page is in [`examples/browser/index.html`](examples/browser/index.html). The IGN service allows calls
from any origin (CORS).

### React hook

[`examples/react/useAddressSearch.ts`](examples/react/useAddressSearch.ts) is a hook built on the `signal` option:
each new text aborts the request of the previous one, so an old answer never replaces a newer one.

```tsx
/** Shows one suggested address. */
function toListItem(address: Address) {
  return <li key={address.id}>{address.label}</li>;
}

/** An address field with its suggestions. */
function AddressField() {
  const [text, setText] = useState("");
  const { addresses, error } = useAddressSearch(text);

  /** Keeps the typed text. */
  function keepText(event: React.ChangeEvent<HTMLInputElement>): void {
    setText(event.target.value);
  }

  return (
    <>
      <input value={text} onChange={keepText} />
      {error !== undefined && <p role="alert">{error.message}</p>}
      <ul>{addresses.map(toListItem)}</ul>
    </>
  );
}
```

The library uses `AbortSignal.any`, available in browsers since 2024 and in Node.js 20.3; to test such a hook,
use an environment that has it (happy-dom does, jsdom 25 does not).

### Options

| Option | Where | Effect |
|---|---|---|
| `baseUrl` | `createGeocoder` | another BAN-compatible service, for example your own Addok |
| `timeoutMs` | `createGeocoder` | time limit of each call, 5000 ms by default |
| `fetch` | `createGeocoder` | your own `fetch` (tests, proxies) |
| `retries` | `createGeocoder` | how many times a `429` or `503` answer is tried again, 0 by default (for example 3) |
| `retryDelayMs` | `createGeocoder` | first pause before a retry, doubled at each try, 500 ms by default; a `Retry-After` header wins |
| `maxRequestsPerSecond` | `createGeocoder` | spaces the requests evenly to stay under the service limit, for batch jobs; no limit by default |
| `cache` | `createGeocoder` | `{ size, ttlMs }`: keeps that many answers in memory for that long, keyed by URL (autocompletion repeats the same prefixes); no cache by default |
| `limit`, `type` | `search`, `reverse` | number of results; `housenumber`, `street`, `locality` or `municipality` |
| `autocomplete`, `postcode`, `citycode`, `near` | `search` | prefix search, filters, and a point that favours nearby results |
| `minScore` | `search` | drops the results whose score (0 to 1) is below this value, so an unknown text does not place a pin far away; no minimum by default |
| `signal` | `search`, `reverse` | cancels the call |

Errors from the network or the service are thrown as `GeocodingError`, with the HTTP `status` when there is one,
and a `code` that tells them apart:

| `code` | Cause |
|---|---|
| `timeout` | the time limit (`timeoutMs`) ran out |
| `aborted` | your `signal` cancelled the call |
| `network` | the service could not be reached |
| `http` | the service answered an HTTP error (see `status`) |
| `format` | the answer is not JSON, or not a GeoJSON feature collection |

## Development

```sh
npm ci
npm run typecheck && npm run lint && npm run coverage
```

The CI fails below **100 %** coverage of lines, branches, functions and statements.

`npm run test:integration` calls the real public service (search, reverse, parcel, point of interest, CSV). The
[Live API](.github/workflows/integration.yml) workflow runs it every Monday, to detect a change of the API early; the unit
tests never call the network.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). It is generated by [git-cliff](https://git-cliff.org) from the
[Conventional Commits](https://www.conventionalcommits.org) messages: every `feat` and `fix` commit is listed with its link.

To release, run `npm version <patch|minor|major>` (it regenerates the changelog in the version commit), then
`git push --follow-tags`. The tag starts the release workflow, which creates the GitHub release with the same notes.

## License

[MIT](LICENSE) © Mickael Saidi
