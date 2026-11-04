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

// ── Chat de la sala ───────────────────────────────────────────
async function room() {
  const host = client();
  const hostMsgs = [];
  host.on("chat-message", (m) => hostMsgs.push(m));
  host.emit("create-session", { name: "Ana" });
  const { code } = await once(host, "session-created");
  const guest = client();
  guest.emit("join-session", { code, name: "Luis" });
  const joined = await once(guest, "session-joined");
  return { host, guest, code, hostMsgs, joined };
}

const nextMessage = (socket, predicate = () => true) =>
  new Promise((resolve) => {
    const handler = (m) => { if (predicate(m)) { socket.off("chat-message", handler); resolve(m); } };
    socket.on("chat-message", handler);
  });

test("un mensaje llega a todos, con autor, y queda en el historial de quien llega tarde", async () => {
  const { host, guest, code } = await room();
  const received = nextMessage(host, (m) => m.type === "text");
  guest.emit("chat-message", { text: "  hola a todos  " });
  const msg = await received;
  assert.equal(msg.text, "hola a todos");
  assert.equal(msg.author, "Luis");

  const late = client();
  late.emit("join-session", { code, name: "Eva" });
  const { messages } = await once(late, "session-joined");
  assert.ok(messages.some((m) => m.text === "hola a todos"), "historial incluye el mensaje");
  assert.ok(messages.some((m) => m.type === "system" && /Luis se unió/.test(m.text)));
});

test("compartir una canción crea una tarjeta; ids inválidos se ignoran", async () => {
  const { host, guest } = await room();
  const card = nextMessage(host, (m) => m.type === "song");
  guest.emit("share-song", { song: { videoId: "../hack", title: "x" } });
  guest.emit("share-song", { song: { videoId: "lTRiuFIWV54", title: "1 A.M", channel: "Lofi Girl" }, text: "escuchen esta" });
  const msg = await card;
  assert.equal(msg.song.videoId, "lTRiuFIWV54");
  assert.equal(msg.text, "escuchen esta");
});

test("agregar a la cola avisa en el chat, salvo lo que agrega la radio", async () => {
  const { host, guest } = await room();
  const notice = nextMessage(host, (m) => m.type === "system" && /agregó/.test(m.text));
  guest.emit("add-song", { song: { videoId: "abcdefghij1", title: "Radio", channel: "", source: "radio" } });
  guest.emit("add-song", { song: { videoId: "abcdefghij2", title: "Elegida", channel: "" } });
  assert.equal((await notice).text, "Luis agregó «Elegida» a la cola");
});

test("las reacciones se sincronizan entre participantes", async () => {
  const { host, guest } = await room();
  const posted = nextMessage(guest, (m) => m.type === "text");
  host.emit("chat-message", { text: "¿qué ponemos?" });
  const msg = await posted;
  const reaction = once(host, "chat-reaction");
  guest.emit("react", { messageId: msg.id, emoji: "🔥" });
  const { messageId, reactions } = await reaction;
  assert.equal(messageId, msg.id);
  assert.equal(reactions["🔥"].length, 1);
});

test("el límite de mensajes avisa a quien envía demasiado rápido", async () => {
  const { guest } = await room();
  const warned = once(guest, "chat-error");
  for (let i = 0; i < 12; i++) guest.emit("chat-message", { text: `spam ${i}` });
  assert.match((await warned).message, /rápido/);
});

test("quien escribe aparece para los demás", async () => {
  const { host, guest } = await room();
  const typing = once(host, "typing");
  guest.emit("typing");
  assert.equal((await typing).name, "Luis");
});
