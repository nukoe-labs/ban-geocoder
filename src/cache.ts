import type { CacheOptions } from "./types.js";

/** A stored value with the time after which it is too old to be used. */
interface CacheEntry<Value> {
  value: Value;
  expiresAt: number;
}

/** A small in-memory cache that forgets the least recently used entry when full, and entries older than their time to live. */
export interface LruCache<Value> {
  get(key: string): Value | undefined;
  set(key: string, value: Value): void;
}

/** Checks that the cache size is a whole number above zero and the time to live a finite number above zero. */
function checkCacheOptions(options: CacheOptions): void {
  const sizeIsValid = Number.isInteger(options.size) && options.size > 0;
  const timeToLiveIsValid = Number.isFinite(options.ttlMs) && options.ttlMs > 0;
  if (!sizeIsValid || !timeToLiveIsValid) {
    throw new RangeError(`The cache needs a whole size above 0 and a ttlMs above 0, not ${options.size} and ${options.ttlMs}.`);
  }
}

/** Builds an in-memory LRU cache with the given size and time to live. */
export function createLruCache<Value>(options: CacheOptions): LruCache<Value> {
  checkCacheOptions(options);
  const entries = new Map<string, CacheEntry<Value>>();

  /** Gives the stored value of a key and marks it as recently used, or undefined when it is missing or too old. */
  function get(key: string): Value | undefined {
    const entry = entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    entries.delete(key);
    if (entry.expiresAt <= Date.now()) {
      return undefined;
    }
    entries.set(key, entry);
    return entry.value;
  }

  /** Stores a value, and forgets the least recently used entry when the cache is full. */
  function set(key: string, value: Value): void {
    entries.delete(key);
    entries.set(key, { value, expiresAt: Date.now() + options.ttlMs });
    if (entries.size > options.size) {
      const oldestKey = entries.keys().next().value as string;
      entries.delete(oldestKey);
    }
  }

  return { get, set };
}
