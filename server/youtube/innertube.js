"use strict";

// Cliente mínimo de la API InnerTube de YouTube (la que usa la web oficial).
// No requiere API key. Aísla aquí los detalles de transporte para que las
// rutas y los parsers no dependan de https ni de cabeceras.

const https = require("https");

const REQUEST_TIMEOUT_MS = 8000;

const CONTEXTS = {
  web: {
    client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "es", gl: "CO" },
  },
  music: {
    client: { clientName: "WEB_REMIX", clientVersion: "1.20240101.01.00", hl: "es", gl: "CO" },
  },
};

const HOSTS = {
  web: "www.youtube.com",
  music: "music.youtube.com",
};

/**
 * Hace un POST a /youtubei/v1/<endpoint>.
 * @param {"search"|"player"|"browse"|"next"} endpoint
 * @param {object} body  cuerpo sin el `context`
 * @param {{ client?: "web"|"music", timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, data: any }>}
 */
function innertube(endpoint, body, { client = "web", timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const hostname = HOSTS[client];
  const payload = JSON.stringify({ context: CONTEXTS[client], ...body });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: `/youtubei/v1/${endpoint}?prettyPrint=false`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Origin: `https://${hostname}`,
          Referer: `https://${hostname}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
          } catch {
            reject(new Error(`YouTube respondió ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout de ${timeoutMs} ms en ${endpoint}`)));
    req.on("error", reject);
    req.end(payload);
  });
}

module.exports = { innertube };
