"use strict";

// Punto de entrada: API de YouTube + sesiones Jam + build de Angular en un solo puerto.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { createApiRouter } = require("./api");
const { registerJamHandlers, getRoomsStatus } = require("./jam/sessions");
const { createRoomStore } = require("./jam/store");
const { createIndexHandler } = require("./share");
const { innertube } = require("./youtube/innertube");

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "20kb" }));
// Salud del servicio (Railway la usa para saber si el despliegue quedó bien).
app.get("/api/health", (_req, res) => res.json({ ok: true }));
// Estado de varias salas, para la lista "Mis salas".
app.post("/api/rooms/status", (req, res) => res.json({ rooms: getRoomsStatus(req.body?.codes) }));
app.use("/api", createApiRouter());

// Con DATA_DIR (p. ej. un volumen de Railway en /data) las salas sobreviven a reinicios.
const dataDir = process.env.DATA_DIR;
const store = createRoomStore({ file: dataDir ? path.join(dataDir, "rooms.json") : null });
const jam = registerJamHandlers(io, { store });
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    jam.persistNow();
    process.exit(0);
  });
}

// Build de Angular (modo túnel / producción).
// index.html no se sirve como archivo estático: pasa por createIndexHandler para
// que los enlaces de canción o de sala muestren su vista previa en WhatsApp.
const distPath = path.join(__dirname, "..", "dist", "vinyl-player", "browser");
app.use(express.static(distPath, { index: false }));
const serveIndex = createIndexHandler({ distPath, innertube });
app.get(/^(?!\/api|\/socket\.io).*/, serveIndex);

server.listen(PORT, () => {
  console.log(`Vinyl Player (API + Jam) en http://localhost:${PORT}`);
});
