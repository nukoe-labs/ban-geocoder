import type { Address } from "./types.js";

/** An address of type `housenumber`, whose house number and street are known to be present. */
export type HouseNumberAddress = Address & { type: "housenumber"; housenumber: string; street: string };

/** Tells whether an address is a house number with its number and street, and narrows its type. */
export function isHouseNumber(address: Address): address is HouseNumberAddress {
  const isHouseNumberType = address.type === "housenumber";
  const hasNumberAndStreet = address.housenumber !== undefined && address.street !== undefined;
  return isHouseNumberType && hasNumberAndStreet;
}
