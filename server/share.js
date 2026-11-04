"use strict";

// Vista previa de enlaces compartidos (WhatsApp, Telegram, etc.).
// Los bots de vista previa no ejecutan Angular: leen el <head> del HTML.
// Por eso, si la URL trae ?song= o ?jam=, el servidor escribe ahí el título,
// la descripción y la imagen correctos antes de enviar index.html.

const fs = require("fs");
const path = require("path");
const { isVideoId, cleanArtist } = require("./youtube/parsers");
const { TtlCache } = require("./youtube/cache");

const ROOM_CODE = /^[A-Z0-9]{6}$/;
const META_BLOCK = /<!-- share-meta:start[\s\S]*?<!-- share-meta:end -->/;
const DEFAULT_DESCRIPTION =
  "Escucha música con tus amigos: tocadiscos, radio automática y salas con chat en tiempo real.";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** @typedef {{ title: string, description: string, image: string, url: string }} ShareMeta */

/** @returns {ShareMeta} */
function songMeta({ videoId, title, author, url }) {
  return {
    title: author ? `${title} — ${author}` : title,
    description: "Escúchala conmigo en Vinyl Player 🎶",
    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url,
  };
}

/** @returns {ShareMeta} */
function roomMeta({ code, url, origin }) {
  return {
    title: `Únete a mi sala en Vinyl · ${code}`,
    description: "Chateamos, compartimos canciones y armamos la cola entre todos, en tiempo real.",
    image: `${origin}/og-default.jpg`,
    url,
  };
}

/** @returns {ShareMeta} */
function defaultMeta({ url, origin }) {
  return { title: "Vinyl Player", description: DEFAULT_DESCRIPTION, image: `${origin}/og-default.jpg`, url };
}

/** Reemplaza el bloque marcado de index.html por los metadatos dados (escapados). */
function injectMeta(html, meta) {
  const m = {
    title: escapeHtml(meta.title),
    description: escapeHtml(meta.description),
    image: escapeHtml(meta.image),
    url: escapeHtml(meta.url),
  };
  const block = [
    `<meta name="description" content="${m.description}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Vinyl Player">`,
    `<meta property="og:title" content="${m.title}">`,
    `<meta property="og:description" content="${m.description}">`,
    `<meta property="og:image" content="${m.image}">`,
    `<meta property="og:url" content="${m.url}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n  ");
  return html.replace(META_BLOCK, block).replace(/<title>[^<]*<\/title>/, `<title>${m.title}</title>`);
}

/**
 * Handler para servir index.html con la vista previa correcta.
 * @param {{ distPath: string, innertube: Function, logger?: Pick<Console, "error"> }} deps
 */
function createIndexHandler({ distPath, innertube, logger = console }) {
  const indexPath = path.join(distPath, "index.html");
  const titles = new TtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 1000 });
  let cached = { mtimeMs: 0, html: "" };

  const readIndex = () => {
    const { mtimeMs } = fs.statSync(indexPath);
    if (mtimeMs !== cached.mtimeMs) cached = { mtimeMs, html: fs.readFileSync(indexPath, "utf8") };
    return cached.html;
  };

  const videoTitle = async (videoId) => {
    const hit = titles.get(videoId);
    if (hit) return hit;
    try {
      const r = await innertube("player", { videoId });
      const d = r.status === 200 ? r.data?.videoDetails : null;
      const info = { title: d?.title || "Una canción", author: cleanArtist(d?.author) };
      titles.set(videoId, info);
      return info;
    } catch (err) {
      logger.error("[share] título no disponible:", err.message);
      return { title: "Una canción", author: "" };
    }
  };

  return async (req, res) => {
    let html;
    try {
      html = readIndex();
    } catch {
      return res.status(503).send("La app aún no está compilada. Ejecuta npm run build.");
    }

    // Detrás de ngrok u otro proxy, respeta el host y protocolo públicos.
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
    const origin = `${proto}://${host}`;
    const url = origin + req.originalUrl;
    const song = req.query.song;
    const jam = typeof req.query.jam === "string" ? req.query.jam.toUpperCase() : "";

    let meta = defaultMeta({ url, origin });
    if (isVideoId(song)) meta = songMeta({ videoId: song, url, ...(await videoTitle(song)) });
    else if (ROOM_CODE.test(jam)) meta = roomMeta({ code: jam, url, origin });

    res.set("Cache-Control", "no-cache").type("html").send(injectMeta(html, meta));
  };
}

module.exports = { escapeHtml, injectMeta, songMeta, roomMeta, defaultMeta, createIndexHandler };
