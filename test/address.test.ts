import { describe, expect, expectTypeOf, it } from "vitest";
import { isHouseNumber, toPostalLines } from "../src/index.js";
import type { Address } from "../src/index.js";

const HOUSE_NUMBER: Address = {
  id: "95127_1448_00008",
  label: "8 Boulevard du Port 95000 Cergy",
  score: 0.49,
  type: "housenumber",
  coordinates: { lat: 49.031624, lon: 2.062821 },
  housenumber: "8",
  street: "Boulevard du Port",
  postcode: "95000",
  city: "Cergy",
};

const STREET: Address = {
  id: "95127_1448",
  label: "Boulevard du Port 95000 Cergy",
  score: 0.4,
  type: "street",
  coordinates: { lat: 49.03, lon: 2.06 },
  street: "Boulevard du Port",
  postcode: "95000",
  city: "Cergy",
};

describe("isHouseNumber", function isHouseNumberTests() {
  it("accepts a house number with its number and street, and narrows the type", function acceptsHouseNumber() {
    expect(isHouseNumber(HOUSE_NUMBER)).toBe(true);
    const narrowed = [HOUSE_NUMBER].filter(isHouseNumber);
    expectTypeOf(narrowed).items.toHaveProperty("housenumber").toEqualTypeOf<string>();
    expectTypeOf(narrowed).items.toHaveProperty("street").toEqualTypeOf<string>();
  });

  it("refuses another type", function refusesStreet() {
    expect(isHouseNumber(STREET)).toBe(false);
  });

  it("refuses a house number without its number or street", function refusesIncomplete() {
    expect(isHouseNumber({ ...HOUSE_NUMBER, street: undefined } as unknown as Address)).toBe(false);
    const withoutNumber: Address = { ...STREET, type: "housenumber" };
    expect(isHouseNumber(withoutNumber)).toBe(false);
  });
});

describe("toPostalLines", function toPostalLinesTests() {
  it("gives the number and street, then the postcode and city in capitals", function houseNumberLines() {
    expect(toPostalLines(HOUSE_NUMBER)).toEqual(["8 Boulevard du Port", "95000 CERGY"]);
  });

  it("keeps the accents of the city in capitals", function accentedCity() {
    const address: Address = { ...STREET, street: "Rue de la Gare", postcode: "77300", city: "Fontainebleau-Évry" };
    expect(toPostalLines(address)).toEqual(["Rue de la Gare", "77300 FONTAINEBLEAU-ÉVRY"]);
  });

  it("leaves out a line without any of its parts", function missingParts() {
    const municipality: Address = { id: "95127", label: "Cergy", score: 0.9, type: "municipality", coordinates: { lat: 49.03, lon: 2.06 }, city: "Cergy" };
    expect(toPostalLines(municipality)).toEqual(["CERGY"]);
    const bare: Address = { id: "", label: "", score: 0, type: "street", coordinates: { lat: 0, lon: 0 }, street: " " };
    expect(toPostalLines(bare)).toEqual([]);
  });
});
