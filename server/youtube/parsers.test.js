"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./__fixtures__/next-music.json");
const { parseRelatedResults, parseSearchResults, textOf, isVideoId } = require("./parsers");

const SEED = "lTRiuFIWV54";

test("parseRelatedResults excluye la canción semilla", () => {
  const songs = parseRelatedResults(fixture, SEED);
  assert.ok(songs.length > 0);
  assert.ok(songs.every((s) => s.videoId !== SEED));
});

test("parseRelatedResults usa solo el artista, sin visitas ni Me gusta", () => {
  const songs = parseRelatedResults(fixture, SEED);
  const powfu = songs.find((s) => s.title.startsWith("until i lose my hearing"));
  assert.equal(powfu?.channel, "Powfu, Jhove y Lofi Girl");
  assert.ok(songs.every((s) => !s.channel.includes("visualizaciones")));
});

test("parseRelatedResults incluye la duración y respeta el límite", () => {
  const songs = parseRelatedResults(fixture, SEED, 2);
  assert.equal(songs.length, 2);
  assert.match(songs[0].duration ?? "", /^\d+:\d{2}/);
});

test("parseRelatedResults ignora duplicados y elementos que no son canciones", () => {
  const dup = structuredClone(fixture);
  const list =
    dup.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer
      .tabs[0].tabRenderer.content.musicQueueRenderer.content.playlistPanelRenderer.contents;
  list.push(list[1], { somethingElse: {} });
  const ids = parseRelatedResults(dup, SEED).map((s) => s.videoId);
  assert.equal(new Set(ids).size, ids.length);
});

test("parseRelatedResults tolera respuestas vacías o con otra forma", () => {
  assert.deepEqual(parseRelatedResults({}, SEED), []);
  assert.deepEqual(parseRelatedResults(null, SEED), []);
});

test("parseSearchResults lee videoRenderer y descarta ids inválidos", () => {
  const data = {
    contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
      { itemSectionRenderer: { contents: [
        { videoRenderer: { videoId: "abcdefghijk", title: { runs: [{ text: "Canción" }] }, ownerText: { runs: [{ text: "Artista" }] }, lengthText: { simpleText: "3:21" } } },
        { videoRenderer: { videoId: "corto", title: { runs: [{ text: "x" }] } } },
        { channelRenderer: {} },
      ] } },
    ] } } } },
  };
  assert.deepEqual(parseSearchResults(data), [
    { videoId: "abcdefghijk", title: "Canción", channel: "Artista", duration: "3:21" },
  ]);
});

test("textOf y isVideoId", () => {
  assert.equal(textOf({ runs: [{ text: "a" }, { text: "b" }] }), "ab");
  assert.equal(textOf({ simpleText: "c" }), "c");
  assert.equal(textOf(undefined), "");
  assert.ok(isVideoId("lTRiuFIWV54"));
  assert.ok(!isVideoId("../../etc"));
});
