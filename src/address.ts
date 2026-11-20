import type { Address, Coordinates } from "./types.js";

/** The mean radius of the Earth in meters (IUGG), used by the haversine formula. */
const EARTH_MEAN_RADIUS_M = 6_371_008.8;
const DEGREES_PER_HALF_TURN = 180;

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

/** Converts an angle from degrees to radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
}

/** Gives the distance in meters along the Earth's surface from an address to a point, with the haversine formula. */
export function distanceTo(address: Address, point: Coordinates): number {
  const latitudeA = toRadians(address.coordinates.lat);
  const latitudeB = toRadians(point.lat);
  const halfLatitudeDelta = (latitudeB - latitudeA) / 2;
  const halfLongitudeDelta = toRadians(point.lon - address.coordinates.lon) / 2;
  const sineOfHalfLatitude = Math.sin(halfLatitudeDelta);
  const sineOfHalfLongitude = Math.sin(halfLongitudeDelta);
  const haversine = sineOfHalfLatitude ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * sineOfHalfLongitude ** 2;
  const centralAngle = 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
  return EARTH_MEAN_RADIUS_M * centralAngle;
}
