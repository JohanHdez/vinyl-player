"use strict";

// Rutas HTTP de la API. Recibe sus dependencias (`youtube`) por parámetro para
// poder probarlas sin red.

const express = require("express");
const { innertube: defaultInnertube } = require("./youtube/innertube");
const {
  isVideoId,
  parseSearchResults,
  parseTrendingResults,
  parseRelatedResults,
} = require("./youtube/parsers");
const { TtlCache } = require("./youtube/cache");

const MAX_QUERY_LENGTH = 200;

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
      channel: details?.author || "",
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

  return router;
}

module.exports = { createApiRouter };
