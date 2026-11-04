"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TtlCache } = require("./cache");

test("devuelve el valor mientras no expira y lo borra después", () => {
  let now = 1000;
  const cache = new TtlCache({ ttlMs: 100, maxEntries: 10, now: () => now });
  cache.set("a", 1);
  now = 1099;
  assert.equal(cache.get("a"), 1);
  now = 1100;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("descarta la entrada más vieja al superar el máximo", () => {
  const cache = new TtlCache({ ttlMs: 1000, maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});
