"use strict";

// Punto de entrada: API de YouTube + sesiones Jam + build de Angular en un solo puerto.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { createApiRouter } = require("./api");
const { registerJamHandlers } = require("./jam/sessions");
const { createIndexHandler } = require("./share");
const { innertube } = require("./youtube/innertube");

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "20kb" }));
app.use("/api", createApiRouter());
registerJamHandlers(io);

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
