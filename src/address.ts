import type { Address } from "./types.js";

/** An address of type `housenumber`, whose house number and street are known to be present. */
export type HouseNumberAddress = Address & { type: "housenumber"; housenumber: string; street: string };

/** Tells whether an address is a house number with its number and street, and narrows its type. */
export function isHouseNumber(address: Address): address is HouseNumberAddress {
  const isHouseNumberType = address.type === "housenumber";
  const hasNumberAndStreet = address.housenumber !== undefined && address.street !== undefined;
  return isHouseNumberType && hasNumberAndStreet;
}

/** Joins the parts of a line that are present, with a space, or gives undefined when none is. */
function joinPresentParts(parts: Array<string | undefined>): string | undefined {
  const presentParts = parts.filter(isPresentText);
  if (presentParts.length === 0) {
    return undefined;
  }
  return presentParts.join(" ");
}

/** Tells whether a part of a line is a text that is not empty. */
function isPresentText(part: string | undefined): part is string {
  const isPresent = part !== undefined && part.trim() !== "";
  return isPresent;
}

/**
 * Gives the lines of a French postal address: the number and the street, then the postcode and the city in capitals.
 * A line is left out when the address has none of its parts.
 */
export function toPostalLines(address: Address): string[] {
  const streetLine = joinPresentParts([address.housenumber, address.street]);
  const city = address.city?.toLocaleUpperCase("fr-FR");
  const cityLine = joinPresentParts([address.postcode, city]);
  return [streetLine, cityLine].filter(isPresentText);
}
