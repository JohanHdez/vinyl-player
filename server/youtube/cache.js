"use strict";

/**
 * Caché en memoria con tiempo de vida y tamaño máximo (descarta lo más viejo).
 * Evita repetir llamadas a YouTube cuando varios clientes piden lo mismo.
 */
class TtlCache {
  /** @param {{ ttlMs: number, maxEntries: number, now?: () => number }} opts */
  constructor({ ttlMs, maxEntries, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  get size() {
    return this.entries.size;
  }
}

module.exports = { TtlCache };
