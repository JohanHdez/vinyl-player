"use strict";

// Funciones puras que convierten respuestas de InnerTube en Song[].
// No hacen red: se prueban con fixtures en parsers.test.js.

/** @typedef {{ videoId: string, title: string, channel: string, duration?: string }} Song */

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** Une los `runs` de un texto de YouTube. */
function textOf(node) {
  if (!node) return "";
  if (typeof node.simpleText === "string") return node.simpleText;
  return (node.runs || []).map((r) => r.text).join("");
}

/** Quita el sufijo " - Topic" de los canales automáticos de artistas de YouTube. */
function cleanArtist(name) {
  return typeof name === "string" ? name.replace(/\s+-\s+Topic$/i, "").trim() : "";
}

function isVideoId(value) {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/** @returns {Song[]} */
function parseSearchResults(data, limit = 15) {
  const songs = [];
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

  for (const section of sections) {
    for (const item of section?.itemSectionRenderer?.contents || []) {
      const video = item?.videoRenderer;
      if (!isVideoId(video?.videoId)) continue;
      songs.push({
        videoId: video.videoId,
        title: textOf(video.title),
        channel: textOf(video.ownerText) || textOf(video.shortBylineText),
        duration: textOf(video.lengthText) || undefined,
      });
      if (songs.length >= limit) return songs;
    }
  }
  return songs;
}

/** @returns {Song[]} */
function parseTrendingResults(data, limit = 20) {
  const songs = [];
  const tabs =
    data?.contents?.singleColumnBrowseResultsRenderer?.tabs ||
    data?.contents?.twoColumnBrowseResultsRenderer?.tabs ||
    [];

  for (const tab of tabs) {
    for (const section of tab?.tabRenderer?.content?.sectionListRenderer?.contents || []) {
      const items =
        section?.musicCarouselShelfRenderer?.contents ||
        section?.musicShelfRenderer?.contents ||
        section?.gridRenderer?.items ||
        [];

      for (const item of items) {
        const video = item?.musicResponsiveListItemRenderer || item?.musicTwoRowItemRenderer;
        if (!video) continue;

        const nav =
          video?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
            ?.playNavigationEndpoint || video?.navigationEndpoint;
        const videoId = nav?.watchEndpoint?.videoId || video?.playlistItemData?.videoId;
        if (!isVideoId(videoId)) continue;

        const columns = video.flexColumns || [];
        const title = columns.length
          ? textOf(columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text)
          : textOf(video.title);
        const channel = columns.length > 1
          ? textOf(columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text)
          : textOf(video.subtitle);

        if (!title) continue;
        songs.push({ videoId, title, channel });
        if (songs.length >= limit) return songs;
      }
    }
  }
  return songs;
}

/**
 * Canciones relacionadas: la "radio" (automix) que YouTube Music arma a partir
 * de una canción semilla. Excluye la semilla y los duplicados.
 * @returns {Song[]}
 */
function parseRelatedResults(data, seedVideoId, limit = 25) {
  const contents =
    data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content
      ?.playlistPanelRenderer?.contents || [];

  const seen = new Set([seedVideoId]);
  const songs = [];

  for (const item of contents) {
    const video =
      item?.playlistPanelVideoRenderer ||
      item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
    if (!isVideoId(video?.videoId) || seen.has(video.videoId)) continue;
    seen.add(video.videoId);

    const title = textOf(video.title);
    if (!title) continue;

    songs.push({
      videoId: video.videoId,
      title,
      // shortBylineText trae solo el artista; longBylineText añade visitas y "Me gusta".
      channel: textOf(video.shortBylineText) || textOf(video.longBylineText).split(" • ")[0],
      duration: textOf(video.lengthText) || undefined,
    });
    if (songs.length >= limit) break;
  }
  return songs;
}

module.exports = { textOf, isVideoId, cleanArtist, parseSearchResults, parseTrendingResults, parseRelatedResults };
