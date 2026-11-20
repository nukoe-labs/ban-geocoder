/** Reads a text property of a feature, or undefined when it is missing or not a text. */
export function readText(properties: Record<string, unknown>, name: string): string | undefined {
  const value = properties[name];
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

/** Reads a number property of a feature, or undefined when it is missing or not a finite number. */
export function readNumber(properties: Record<string, unknown>, name: string): number | undefined {
  const value = properties[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

/** Tells whether a value is a text. */
function isText(value: unknown): value is string {
  const valueIsText = typeof value === "string";
  return valueIsText;
}

/** Reads a list of texts of a feature, keeping only the texts; a single text gives a list of one, anything else an empty list. */
export function readTextList(properties: Record<string, unknown>, name: string): string[] {
  const value = properties[name];
  if (isText(value)) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isText);
}
