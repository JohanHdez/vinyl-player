"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createApiRouter } = require("./api");

const fixture = (name) => require(`./youtube/__fixtures__/${name}.json`);
const FIXTURES = {
  FEmusic_moods_and_genres: fixture("moods"),
  FEmusic_charts: fixture("charts"),
  FEmusic_moods_and_genres_category: fixture("category"),
};

const calls = [];
async function fakeInnertube(endpoint, body) {
  calls.push(body.browseId);
  if (FIXTURES[body.browseId]) return { status: 200, data: FIXTURES[body.browseId] };
  if (body.browseId?.startsWith("UC")) return { status: 200, data: fixture("artist") };
  if (body.browseId?.startsWith("VL")) return { status: 200, data: fixture("playlist") };
  return { status: 404, data: {} };
}

let server;
let base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter({ innertube: fakeInnertube, logger: { error() {}, warn() {} } }));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const post = async (path, body = {}) => {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test("/explore combina categorías y artistas, y queda en caché", async () => {
  const first = await post("/explore");
  assert.equal(first.status, 200);
  assert.equal(first.body.sections.length, 2);
  assert.ok(first.body.artists.length > 0);
  const n = calls.length;
  await post("/explore");
  assert.equal(calls.length, n, "la segunda llamada no debe ir a YouTube");
});

test("/category valida params y devuelve la página", async () => {
  assert.equal((await post("/category", { params: "<script>" })).status, 400);
  const { status, body } = await post("/category", { params: "ggMPOg1uX0UzWGxlRE5jMDVk" });
  assert.equal(status, 200);
  assert.equal(body.title, "Cumbia");
});

test("/artist exige un id de canal", async () => {
  assert.equal((await post("/artist", { id: "Blessd" })).status, 400);
  const { body } = await post("/artist", { id: "UC3vpYFFzqIzsXbMgneDTSeQ" });
  assert.equal(body.name, "Blessd");
});

test("/playlist exige un id VL…", async () => {
  assert.equal((await post("/playlist", { id: "../x" })).status, 400);
  const { body } = await post("/playlist", { id: "VLRDCLAK5uy_k6ACq4WNfG" });
  assert.ok(body.songs.length > 0);
});
