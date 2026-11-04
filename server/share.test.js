"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const { escapeHtml, injectMeta, createIndexHandler } = require("./share");

const INDEX = `<!doctype html><html><head><title>Vinyl</title>
<!-- share-meta:start -->
<meta property="og:title" content="Vinyl Player">
<!-- share-meta:end -->
</head><body><app-root></app-root></body></html>`;

test("escapeHtml neutraliza comillas y etiquetas", () => {
  assert.equal(escapeHtml(`"><script>alert(1)</script>`), "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("injectMeta reemplaza el bloque y el <title>, escapando los valores", () => {
  const html = injectMeta(INDEX, { title: 'Hola "mundo"', description: "d", image: "https://x/i.jpg", url: "https://x/?song=1" });
  assert.match(html, /<title>Hola &quot;mundo&quot;<\/title>/);
  assert.match(html, /og:title" content="Hola &quot;mundo&quot;"/);
  assert.match(html, /og:image" content="https:\/\/x\/i.jpg"/);
  assert.doesNotMatch(html, /share-meta:start/);
});

let server;
let base;
let dir;
const calls = [];
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vinyl-share-"));
  fs.writeFileSync(path.join(dir, "index.html"), INDEX);
  const fakeInnertube = async (endpoint, body) => {
    calls.push(body.videoId);
    return { status: 200, data: { videoDetails: { title: "Nunca es suficiente <3", author: "Los Ángeles Azules" } } };
  };
  const app = express();
  app.get(/.*/, createIndexHandler({ distPath: dir, innertube: fakeInnertube, logger: { error() {} } }));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = (q, headers = {}) => fetch(base + "/" + q, { headers }).then((r) => r.text());

test("un enlace de canción muestra título, artista y portada", async () => {
  const html = await get("?song=wVFbmHVJRfA");
  assert.match(html, /og:title" content="Nunca es suficiente &lt;3 — Los Ángeles Azules"/);
  assert.match(html, /og:image" content="https:\/\/i.ytimg.com\/vi\/wVFbmHVJRfA\/hqdefault.jpg"/);
});

test("el título de una canción se cachea", async () => {
  const before = calls.length;
  await get("?song=wVFbmHVJRfA");
  assert.equal(calls.length, before);
});

test("un enlace de sala invita con el código", async () => {
  const html = await get("?jam=abc123");
  assert.match(html, /og:title" content="Únete a mi sala en Vinyl · ABC123"/);
});

test("valores inválidos usan la vista previa por defecto y respetan el host público", async () => {
  const html = await get("?song=<script>&jam=x", { "x-forwarded-proto": "https", "x-forwarded-host": "demo.ngrok-free.dev" });
  assert.match(html, /og:title" content="Vinyl Player"/);
  assert.match(html, /og:image" content="https:\/\/demo.ngrok-free.dev\/og-default.jpg"/);
});
