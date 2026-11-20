import { describe, expect, it } from "vitest";
import { createGeocoder, DEFAULT_BASE_URL } from "../src/index.js";
import type { FetchFunction, FetchInit, FetchResponse } from "../src/index.js";

const INPUT_CSV = "adresse,cp\n8 bd du port,95000\n";
const GEOCODED_CSV = "adresse,cp,result_label,result_score\n8 bd du port,95000,8 Boulevard du Port 95000 Cergy,0.5402734449760764\n";

/** One recorded call of the fake fetch. */
interface RecordedCall {
  url: string;
  init: FetchInit | undefined;
}

/** Builds a fake fetch that records each call and answers the given CSV text with the given status. */
function buildCsvFetch(text: string, status = 200): { fetch: FetchFunction; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  /** Records the call and answers the prepared text. */
  async function csvFetch(url: string, init?: FetchInit): Promise<FetchResponse> {
    calls.push({ url, init });
    /** Fails because a CSV answer is not JSON. */
    async function json(): Promise<unknown> {
      throw new SyntaxError("Unexpected token 'a'");
    }
    /** Returns the prepared CSV text. */
    async function readText(): Promise<string> {
      return text;
    }
    return { ok: status === 200, status, json, text: readText };
  }
  return { fetch: csvFetch, calls };
}

/** Lists the fields of a form as name and value pairs, with the file name for a file. */
function listFormFields(form: FormData | undefined): string[][] {
  const fields: string[][] = [];
  for (const [name, value] of form?.entries() ?? []) {
    fields.push([name, readFieldValue(value)]);
  }
  return fields;
}

/** Gives the text of a form value, or the name of a file. */
function readFieldValue(value: FormDataEntryValue): string {
  if (typeof value === "string") {
    return value;
  }
  return `file:${value.name}`;
}

describe("searchCsv", function searchCsvTests() {
  it("posts the file and its columns, and returns the geocoded CSV", async function postsFile() {
    const fake = buildCsvFetch(GEOCODED_CSV);
    const geocoder = createGeocoder({ fetch: fake.fetch });
    const file = new Blob([INPUT_CSV], { type: "text/csv" });
    const result = await geocoder.searchCsv(file, ["adresse"], { postcode: "cp", citycode: "insee", resultColumns: ["result_label", "result_score"] });
    expect(result).toBe(GEOCODED_CSV);
    expect(fake.calls[0]?.url).toBe(`${DEFAULT_BASE_URL}/search/csv/`);
    expect(fake.calls[0]?.init?.method).toBe("POST");
    expect(listFormFields(fake.calls[0]?.init?.body)).toEqual([
      ["data", "file:addresses.csv"],
      ["columns", "adresse"],
      ["result_columns", "result_label"],
      ["result_columns", "result_score"],
      ["postcode", "cp"],
      ["citycode", "insee"],
    ]);
  });

  it("sends only the file and the columns by default", async function defaultForm() {
    const fake = buildCsvFetch(GEOCODED_CSV);
    await createGeocoder({ fetch: fake.fetch }).searchCsv(new Blob([INPUT_CSV]), ["numero", "voie"]);
    expect(listFormFields(fake.calls[0]?.init?.body)).toEqual([["data", "file:addresses.csv"], ["columns", "numero"], ["columns", "voie"]]);
  });

  it("uses its own time limit", async function ownTimeLimit() {
    /** Waits until the signal aborts, then fails like the real fetch. */
    async function hangingFetch(_url: string, init?: FetchInit): Promise<FetchResponse> {
      return new Promise(function waitForAbort(_resolve, reject) {
        init?.signal?.addEventListener("abort", function rejectOnAbort() {
          reject(new Error("The operation was aborted"));
        });
      });
    }
    const geocoder = createGeocoder({ fetch: hangingFetch, timeoutMs: 60_000 });
    await expect(geocoder.searchCsv(new Blob([INPUT_CSV]), ["adresse"], { timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports a service without the CSV endpoint", async function noCsvEndpoint() {
    const fake = buildCsvFetch("", 501);
    const failure = createGeocoder({ fetch: fake.fetch }).searchCsv(new Blob([INPUT_CSV]), ["adresse"]);
    await expect(failure).rejects.toMatchObject({ code: "http", status: 501 });
  });

  it("reports a fetch function that cannot give text", async function noTextMethod() {
    /** Answers without a text() method. */
    async function jsonOnlyFetch(): Promise<FetchResponse> {
      /** Returns an empty object. */
      async function json(): Promise<unknown> {
        return {};
      }
      return { ok: true, status: 200, json };
    }
    const failure = createGeocoder({ fetch: jsonOnlyFetch }).searchCsv(new Blob([INPUT_CSV]), ["adresse"]);
    await expect(failure).rejects.toMatchObject({ code: "format", message: "The fetch function answered without a text() method." });
  });
});
