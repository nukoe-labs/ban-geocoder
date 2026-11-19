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

const [nearest] = await geocoder.reverse({ lat: 48.8584, lon: 2.2945 }, { limit: 1 });
// nearest.label    -> "Avenue Anatole France 75007 Paris"
```

### Autocompletion that cancels the previous request

```ts
let controller = new AbortController();

async function suggest(text: string) {
  controller.abort();
  controller = new AbortController();
  return geocoder.search(text, { autocomplete: true, limit: 5, signal: controller.signal });
}
```

### Options

| Option | Where | Effect |
|---|---|---|
| `baseUrl` | `createGeocoder` | another BAN-compatible service, for example your own Addok |
| `timeoutMs` | `createGeocoder` | time limit of each call, 5000 ms by default |
| `fetch` | `createGeocoder` | your own `fetch` (tests, proxies) |
| `limit`, `type` | `search`, `reverse` | number of results; `housenumber`, `street`, `locality` or `municipality` |
| `autocomplete`, `postcode`, `citycode`, `near` | `search` | prefix search, filters, and a point that favours nearby results |
| `signal` | `search`, `reverse` | cancels the call |

Errors from the network or the service are thrown as `GeocodingError`, with the HTTP `status` when there is one.

## Development

```sh
npm ci
npm run typecheck && npm run lint && npm run coverage
```

The CI fails below **100 %** coverage of lines, branches, functions and statements.

## License

[MIT](LICENSE) © Mickael Saidi
