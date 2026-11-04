"use strict";

// Punto de entrada: API de YouTube + sesiones Jam + build de Angular en un solo puerto.

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { createApiRouter } = require("./api");
const { registerJamHandlers } = require("./jam/sessions");

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "20kb" }));
app.use("/api", createApiRouter());
registerJamHandlers(io);

// Build de Angular (modo túnel / producción)
const distPath = path.join(__dirname, "..", "dist", "vinyl-player", "browser");
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

server.listen(PORT, () => {
  console.log(`Vinyl Player (API + Jam) en http://localhost:${PORT}`);
});
