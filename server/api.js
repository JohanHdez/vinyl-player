"use strict";

// Rutas HTTP de la API. Recibe sus dependencias (`youtube`) por parámetro para
// poder probarlas sin red.

const express = require("express");
const { innertube: defaultInnertube } = require("./youtube/innertube");
const {
  isVideoId,
  cleanArtist,
  parseSearchResults,
  parseTrendingResults,
  parseRelatedResults,
} = require("./youtube/parsers");
const {
  parseMoodsAndGenres,
  parseChartArtists,
  parseCategoryPage,
  parseArtistPage,
  parsePlaylistPage,
  CHANNEL_ID,
  PLAYLIST_BROWSE_ID,
} = require("./youtube/explore-parsers");
const { TtlCache } = require("./youtube/cache");

const MAX_QUERY_LENGTH = 200;
/** Los `params` de una categoría son base64 opaco de YouTube. */
const CATEGORY_PARAMS = /^[\w%=-]{8,200}$/;

/**
 * @param {{ innertube?: typeof defaultInnertube, logger?: Pick<Console, "error"|"warn"> }} [deps]
 */
function createApiRouter({ innertube = defaultInnertube, logger = console } = {}) {
  const router = express.Router();
  const relatedCache = new TtlCache({ ttlMs: 30 * 60 * 1000, maxEntries: 500 });
  const trendingCache = new TtlCache({ ttlMs: 15 * 60 * 1000, maxEntries: 1 });

  /** Envuelve un handler async para responder 502 si YouTube falla. */
  const handle = (name, fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      logger.error(`[api/${name}]`, err.message);
      res.status(502).json({ error: "No se pudo contactar a YouTube" });
    }
  };

  router.post("/search", handle("search", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query || query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ error: "query es obligatorio (máx. 200 caracteres)" });
    }
    const result = await innertube("search", { query });
    if (result.status !== 200) return res.status(502).json({ error: `YouTube respondió ${result.status}` });
    res.json({ items: parseSearchResults(result.data) });
  }));

  router.post("/video-info", handle("video-info", async (req, res) => {
    const videoId = req.body?.videoId;
    if (!isVideoId(videoId)) return res.status(400).json({ error: "videoId inválido" });

    const result = await innertube("player", { videoId });
    const details = result.status === 200 ? result.data?.videoDetails : null;
    res.json({
      videoId,
      title: details?.title || "Video de YouTube",
      channel: cleanArtist(details?.author),
    });
  }));

  router.post("/trending", handle("trending", async (_req, res) => {
    const cached = trendingCache.get("charts");
    if (cached) return res.json({ items: cached });

    const charts = await innertube("browse", { browseId: "FEmusic_charts" }, { client: "music" });
    let items = charts.status === 200 ? parseTrendingResults(charts.data) : [];

    if (items.length === 0) {
      logger.warn("[api/trending] charts vacío, uso búsqueda de respaldo");
      const fallback = await innertube("search", { query: "top hits music" });
      items = fallback.status === 200 ? parseSearchResults(fallback.data) : [];
    }
    if (items.length > 0) trendingCache.set("charts", items);
    res.json({ items });
  }));

  // Canciones parecidas a una semilla: base de las sugerencias y de la radio automática.
  router.post("/related", handle("related", async (req, res) => {
    const videoId = req.body?.videoId;
    if (!isVideoId(videoId)) return res.status(400).json({ error: "videoId inválido" });

    const cached = relatedCache.get(videoId);
    if (cached) return res.json({ items: cached });

    const result = await innertube(
      "next",
      { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true },
      { client: "music" }
    );
    if (result.status !== 200) return res.status(502).json({ error: `YouTube respondió ${result.status}` });

    const items = parseRelatedResults(result.data, videoId);
    if (items.length > 0) relatedCache.set(videoId, items);
    res.json({ items });
  }));

  // ── Explorar ────────────────────────────────────────────────
  const exploreCache = new TtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 1 });
  const pageCache = new TtlCache({ ttlMs: 30 * 60 * 1000, maxEntries: 300 });

  /** Responde desde caché o calcula, guarda y responde. */
  const cached = async (cache, key, res, compute) => {
    const hit = cache.get(key);
    if (hit) return res.json(hit);
    const value = await compute();
    if (value) cache.set(key, value);
    res.json(value ?? {});
  };

  // Géneros, estados de ánimo y artistas principales.
  router.post("/explore", handle("explore", (_req, res) =>
    cached(exploreCache, "explore", res, async () => {
      const [moods, charts] = await Promise.all([
        innertube("browse", { browseId: "FEmusic_moods_and_genres" }, { client: "music" }),
        innertube("browse", { browseId: "FEmusic_charts" }, { client: "music" }),
      ]);
      const sections = moods.status === 200 ? parseMoodsAndGenres(moods.data) : [];
      const artists = charts.status === 200 ? parseChartArtists(charts.data) : [];
      return sections.length || artists.length ? { sections, artists } : null;
    })
  ));

  router.post("/category", handle("category", (req, res) => {
    const params = req.body?.params;
    if (typeof params !== "string" || !CATEGORY_PARAMS.test(params)) {
      return res.status(400).json({ error: "params inválido" });
    }
    return cached(pageCache, `category:${params}`, res, async () => {
      const r = await innertube(
        "browse",
        { browseId: "FEmusic_moods_and_genres_category", params },
        { client: "music" }
      );
      return r.status === 200 ? parseCategoryPage(r.data) : null;
    });
  }));

  router.post("/artist", handle("artist", (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || !CHANNEL_ID.test(id)) return res.status(400).json({ error: "id de artista inválido" });
    return cached(pageCache, `artist:${id}`, res, async () => {
      const r = await innertube("browse", { browseId: id }, { client: "music" });
      return r.status === 200 ? parseArtistPage(r.data) : null;
    });
  }));

  router.post("/playlist", handle("playlist", (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || !PLAYLIST_BROWSE_ID.test(id)) return res.status(400).json({ error: "id de lista inválido" });
    return cached(pageCache, `playlist:${id}`, res, async () => {
      const r = await innertube("browse", { browseId: id }, { client: "music" });
      return r.status === 200 ? parsePlaylistPage(r.data) : null;
    });
  }));

  return router;
}

module.exports = { createApiRouter };
