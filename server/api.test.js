"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fixture = require("./youtube/__fixtures__/next-music.json");
const { createApiRouter } = require("./api");

// InnerTube falso: registra las llamadas y responde con fixtures.
const calls = [];
async function fakeInnertube(endpoint, body, opts) {
  calls.push({ endpoint, body, opts });
  if (endpoint === "next") return { status: 200, data: fixture };
  if (endpoint === "player") return { status: 200, data: { videoDetails: { title: "T", author: "A" } } };
  throw new Error("sin red en pruebas");
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

const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("/related devuelve canciones y pide la radio de YouTube Music", async () => {
  const res = await post("/related", { videoId: "lTRiuFIWV54" });
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.ok(items.length > 0);
  const call = calls.find((c) => c.endpoint === "next");
  assert.equal(call.body.playlistId, "RDAMVMlTRiuFIWV54");
  assert.equal(call.opts.client, "music");
});

test("/related usa caché para la misma semilla", async () => {
  const before = calls.filter((c) => c.endpoint === "next").length;
  await post("/related", { videoId: "lTRiuFIWV54" });
  assert.equal(calls.filter((c) => c.endpoint === "next").length, before);
});

test("/related rechaza ids inválidos", async () => {
  const res = await post("/related", { videoId: "../../etc" });
  assert.equal(res.status, 400);
});

test("/search valida la consulta y responde 502 si YouTube falla", async () => {
  assert.equal((await post("/search", {})).status, 400);
  assert.equal((await post("/search", { query: "x".repeat(201) })).status, 400);
  assert.equal((await post("/search", { query: "lofi" })).status, 502);
});

test("/video-info devuelve título y canal", async () => {
  const res = await post("/video-info", { videoId: "abcdefghijk" });
  assert.deepEqual(await res.json(), { videoId: "abcdefghijk", title: "T", channel: "A" });
});
