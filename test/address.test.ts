import { describe, expect, expectTypeOf, it } from "vitest";
import { isHouseNumber } from "../src/index.js";
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
