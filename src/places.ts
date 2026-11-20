import { readNumber, readText, readTextList } from "./properties.js";
import type { BanFeature, Coordinates, Parcel, PointOfInterest } from "./types.js";

/** Reads the WGS 84 point of a feature. */
function readCoordinates(feature: BanFeature): Coordinates {
  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon };
}

/** Turns one feature of the `parcel` index of the Géoplateforme into a cadastral parcel. */
export function toParcel(feature: BanFeature): Parcel {
  const properties = feature.properties;
  const parcel: Parcel = {
    id: readText(properties, "id") ?? "",
    departmentcode: readText(properties, "departmentcode") ?? "",
    municipalitycode: readText(properties, "municipalitycode") ?? "",
    section: readText(properties, "section") ?? "",
    number: readText(properties, "number") ?? "",
    score: readNumber(properties, "score") ?? 0,
    coordinates: readCoordinates(feature),
  };
  const sheet = readText(properties, "sheet");
  if (sheet !== undefined) {
    parcel.sheet = sheet;
  }
  const city = readText(properties, "city");
  if (city !== undefined) {
    parcel.city = city;
  }
  return parcel;
}

/** Turns one feature of the `poi` index of the Géoplateforme into a point of interest. */
export function toPointOfInterest(feature: BanFeature): PointOfInterest {
  const properties = feature.properties;
  return {
    toponym: readText(properties, "toponym") ?? "",
    names: readTextList(properties, "name"),
    categories: readTextList(properties, "category"),
    postcodes: readTextList(properties, "postcode"),
    citycodes: readTextList(properties, "citycode"),
    cities: readTextList(properties, "city"),
    score: readNumber(properties, "score") ?? 0,
    coordinates: readCoordinates(feature),
  };
}
