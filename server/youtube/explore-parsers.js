"use strict";

// Parsers de "Explorar": categorías (géneros y estados de ánimo), artistas,
// páginas de categoría, de artista y de lista. Funciones puras; se prueban con
// los fixtures recortados de __fixtures__.

const { textOf, isVideoId } = require("./parsers");

/** @typedef {import("./parsers").Song} Song */
/** @typedef {{ id: string, name: string, thumb: string }} Artist */
/** @typedef {{ title: string, color: string, params: string }} Category */
/** @typedef {{ id: string, title: string, subtitle: string, thumb: string }} Playlist */

const ARTIST_PAGE = "MUSIC_PAGE_TYPE_ARTIST";
const CHANNEL_ID = /^UC[\w-]{22}$/;
const PLAYLIST_BROWSE_ID = /^VL[\w-]{10,}$/;

/** Recorre el árbol y llama a `visit` en cada objeto. */
function walk(node, visit, depth = 0) {
  if (!node || typeof node !== "object" || depth > 60) return;
  visit(node);
  for (const key in node) walk(node[key], visit, depth + 1);
}

/** La miniatura más grande de una lista de thumbnails. */
function bestThumb(thumbnails) {
  const list = Array.isArray(thumbnails) ? thumbnails : [];
  return list.reduce((best, t) => ((t?.width ?? 0) >= (best?.width ?? 0) ? t : best), list[0])?.url ?? "";
}

function thumbOf(renderer) {
  return bestThumb(
    renderer?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
  );
}

/** ARGB entero de YouTube ("leftStripeColor") → "#rrggbb". */
function argbToHex(argb) {
  if (typeof argb !== "number") return "#8e7e6d";
  return "#" + (argb & 0xffffff).toString(16).padStart(6, "0");
}

function pageTypeOf(endpoint) {
  return endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
}

function shelfTitle(shelf) {
  return textOf(
    shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title ||
      shelf?.header?.gridHeaderRenderer?.title ||
      shelf?.title
  );
}

/** Artista desde un item de lista o de carrusel, o null si no es artista. */
function artistFrom(renderer) {
  const endpoint = renderer?.navigationEndpoint?.browseEndpoint;
  if (pageTypeOf(endpoint) !== ARTIST_PAGE || !CHANNEL_ID.test(endpoint?.browseId ?? "")) return null;
  const name =
    textOf(renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text) || textOf(renderer.title);
  return name ? { id: endpoint.browseId, name, thumb: thumbOf(renderer) } : null;
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => (seen.has(item[key]) ? false : (seen.add(item[key]), true)));
}

/**
 * FEmusic_moods_and_genres → secciones ("Estados de ánimo y momentos", "Géneros")
 * @returns {{ title: string, items: Category[] }[]}
 */
function parseMoodsAndGenres(data) {
  const sections = [];
  walk(data, (node) => {
    const grid = node.gridRenderer;
    if (!grid) return;
    const items = (grid.items || [])
      .map((i) => i.musicNavigationButtonRenderer)
      .filter((b) => b?.clickCommand?.browseEndpoint?.params)
      .map((b) => ({
        title: textOf(b.buttonText),
        color: argbToHex(b.solid?.leftStripeColor),
        params: b.clickCommand.browseEndpoint.params,
      }));
    if (items.length) sections.push({ title: shelfTitle(grid), items });
  });
  return sections;
}

/** @returns {Artist[]} Artistas principales de FEmusic_charts. */
function parseChartArtists(data, limit = 20) {
  const artists = [];
  walk(data, (node) => {
    const artist = artistFrom(node.musicResponsiveListItemRenderer || node.musicTwoRowItemRenderer);
    if (artist) artists.push(artist);
  });
  return uniqueBy(artists, "id").slice(0, limit);
}

/** Canción desde un musicTwoRowItemRenderer con watchEndpoint (videos de un carrusel). */
function songFromTwoRow(renderer) {
  const videoId = renderer?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!isVideoId(videoId)) return null;
  const title = textOf(renderer.title);
  // El subtítulo es "Artista • 15 M de visualizaciones": nos quedamos con el artista.
  const channel = textOf(renderer.subtitle).split(" • ")[0];
  return title ? { videoId, title, channel } : null;
}

/** Canción desde una fila (musicResponsiveListItemRenderer) de lista o de artista. */
function songFromListItem(renderer, fallbackChannel = "") {
  const videoId = renderer?.playlistItemData?.videoId;
  if (!isVideoId(videoId)) return null;
  const columns = renderer.flexColumns || [];
  const title = textOf(columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
  const second = textOf(columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text);
  const duration = textOf(renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text) || undefined;
  return title ? { videoId, title, channel: second.split(" • ")[0] || fallbackChannel, duration } : null;
}

/**
 * Página de una categoría (FEmusic_moods_and_genres_category + params).
 * @returns {{ title: string, playlists: Playlist[], songs: Song[] }}
 */
function parseCategoryPage(data) {
  const playlists = [];
  const songs = [];
  walk(data, (node) => {
    const r = node.musicTwoRowItemRenderer;
    if (!r) return;
    const browseId = r.navigationEndpoint?.browseEndpoint?.browseId;
    if (PLAYLIST_BROWSE_ID.test(browseId ?? "")) {
      playlists.push({ id: browseId, title: textOf(r.title), subtitle: textOf(r.subtitle), thumb: thumbOf(r) });
      return;
    }
    const song = songFromTwoRow(r);
    if (song) songs.push(song);
  });
  return {
    title: textOf(data?.header?.musicHeaderRenderer?.title),
    playlists: uniqueBy(playlists, "id").slice(0, 12),
    songs: uniqueBy(songs, "videoId").slice(0, 24),
  };
}

/**
 * Página de artista.
 * @returns {{ name: string, thumb: string, songs: Song[], related: Artist[] }}
 */
function parseArtistPage(data) {
  const header = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer;
  const name = textOf(header?.title);
  const thumb = bestThumb(header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails);

  const songs = [];
  const related = [];
  walk(data, (node) => {
    if (node.musicShelfRenderer) {
      for (const item of node.musicShelfRenderer.contents || []) {
        const song = songFromListItem(item.musicResponsiveListItemRenderer, name);
        if (song) songs.push(song);
      }
    }
    if (node.musicCarouselShelfRenderer) {
      for (const item of node.musicCarouselShelfRenderer.contents || []) {
        const artist = artistFrom(item.musicTwoRowItemRenderer);
        if (artist) related.push(artist);
        const song = songFromTwoRow(item.musicTwoRowItemRenderer);
        if (song) songs.push({ ...song, channel: song.channel || name });
      }
    }
  });
  return {
    name,
    thumb,
    songs: uniqueBy(songs, "videoId").slice(0, 20),
    related: uniqueBy(related, "id").filter((a) => a.name !== name).slice(0, 12),
  };
}

/** @returns {{ title: string, songs: Song[] }} Canciones de una lista (browse VL…). */
function parsePlaylistPage(data, limit = 50) {
  const songs = [];
  walk(data, (node) => {
    const song = songFromListItem(node.musicResponsiveListItemRenderer);
    if (song) songs.push(song);
  });
  let title = "";
  walk(data, (node) => {
    if (!title && (node.musicResponsiveHeaderRenderer || node.musicDetailHeaderRenderer)) {
      title = textOf((node.musicResponsiveHeaderRenderer || node.musicDetailHeaderRenderer).title);
    }
  });
  return { title, songs: uniqueBy(songs, "videoId").slice(0, limit) };
}

module.exports = {
  argbToHex,
  bestThumb,
  parseMoodsAndGenres,
  parseChartArtists,
  parseCategoryPage,
  parseArtistPage,
  parsePlaylistPage,
  CHANNEL_ID,
  PLAYLIST_BROWSE_ID,
};
