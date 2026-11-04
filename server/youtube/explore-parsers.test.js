"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const p = require("./explore-parsers");
const fixture = (name) => require(`./__fixtures__/${name}.json`);

test("parseMoodsAndGenres separa estados de ánimo y géneros con color", () => {
  const sections = p.parseMoodsAndGenres(fixture("moods"));
  assert.deepEqual(sections.map((s) => s.title), ["Estados de ánimo y momentos", "Géneros"]);
  const calma = sections[0].items[0];
  assert.equal(calma.title, "Calma");
  assert.match(calma.color, /^#[0-9a-f]{6}$/);
  assert.ok(calma.params.length > 8);
});

test("parseChartArtists devuelve artistas únicos con id de canal y foto", () => {
  const artists = p.parseChartArtists(fixture("charts"));
  assert.ok(artists.length >= 3);
  assert.equal(new Set(artists.map((a) => a.id)).size, artists.length);
  for (const a of artists) {
    assert.match(a.id, p.CHANNEL_ID);
    assert.ok(a.name);
    assert.match(a.thumb, /^https:\/\//);
  }
});

test("parseCategoryPage separa listas y canciones, con el artista sin visitas", () => {
  const page = p.parseCategoryPage(fixture("category"));
  assert.equal(page.title, "Cumbia");
  assert.ok(page.playlists.length > 0 && page.playlists.every((l) => p.PLAYLIST_BROWSE_ID.test(l.id)));
  assert.ok(page.songs.length > 0);
  assert.ok(page.songs.every((s) => !/visualizaciones/.test(s.channel)));
});

test("parseArtistPage trae nombre, foto, canciones y artistas parecidos (sin él mismo)", () => {
  const page = p.parseArtistPage(fixture("artist"));
  assert.equal(page.name, "Blessd");
  assert.match(page.thumb, /^https:\/\//);
  assert.ok(page.songs.length > 0);
  assert.ok(page.related.length > 0);
  assert.ok(page.related.every((a) => a.name !== "Blessd"));
});

test("parsePlaylistPage lee título, canciones y duración", () => {
  const page = p.parsePlaylistPage(fixture("playlist"));
  assert.equal(page.title, "Cumbia Megamix");
  assert.equal(page.songs[0].channel, "Los Ángeles Azules");
  assert.equal(page.songs[0].duration, "4:27");
});

test("los parsers toleran respuestas vacías", () => {
  assert.deepEqual(p.parseMoodsAndGenres({}), []);
  assert.deepEqual(p.parseChartArtists(null), []);
  assert.deepEqual(p.parseCategoryPage({}), { title: "", playlists: [], songs: [] });
  assert.deepEqual(p.parseArtistPage({}), { name: "", thumb: "", songs: [], related: [] });
});

test("argbToHex convierte el color de YouTube", () => {
  assert.equal(p.argbToHex(0xffa4c5ff), "#a4c5ff");
  assert.equal(p.argbToHex(undefined), "#8e7e6d");
});
