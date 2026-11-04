"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { registerJamHandlers } = require("./sessions");

let httpServer;
let io;
let url;
const clients = [];

before(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer);
  registerJamHandlers(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  clients.forEach((c) => c.close());
  await new Promise((resolve) => io.close(resolve));
});

function client() {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  clients.push(socket);
  return socket;
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));

test("el host crea una sesión y un invitado recibe la cola actual al unirse", async () => {
  const host = client();
  const song = { videoId: "lTRiuFIWV54", title: "1 A.M", channel: "Lofi Girl" };
  host.emit("create-session", { name: "Ana", playlist: [song], currentIndex: 0, isPlaying: true });
  const { code } = await once(host, "session-created");
  assert.match(code, /^[A-Z2-9]{6}$/);

  const guest = client();
  const synced = once(guest, "sync-state");
  guest.emit("join-session", { code, name: "Luis", listenLocally: true });
  const state = await synced;
  assert.deepEqual(state.playlist, [song]);
  assert.equal(state.currentIndex, 0);
});

test("las canciones que agrega un participante llegan a los demás", async () => {
  const host = client();
  host.emit("create-session", { name: "Ana" });
  const { code } = await once(host, "session-created");
  const guest = client();
  guest.emit("join-session", { code, name: "Luis" });
  await once(guest, "session-joined");

  const received = once(host, "song-added");
  guest.emit("add-song", { song: { videoId: "abcdefghijk", title: "T", channel: "C" } });
  assert.equal((await received).song.videoId, "abcdefghijk");
});

test("unirse con un código inexistente devuelve error", async () => {
  const guest = client();
  const err = once(guest, "error");
  guest.emit("join-session", { code: "ZZZZZZ", name: "X" });
  assert.equal((await err).message, "Sesion no encontrada");
});
