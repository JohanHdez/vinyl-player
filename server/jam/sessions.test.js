"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { registerJamHandlers, getRoomsStatus, sessions } = require("./sessions");

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

  const received = once(host, "queue-updated");
  guest.emit("add-song", { song: { videoId: "abcdefghijk", title: "T", channel: "C" } });
  assert.equal((await received).playlist[0].videoId, "abcdefghijk");
});

test("unirse con un código inexistente devuelve error", async () => {
  const guest = client();
  const err = once(guest, "error");
  guest.emit("join-session", { code: "ZZZZZZ", name: "X" });
  assert.match((await err).message, /No encontré esa sala/);
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

test("solo el anfitrión puede reemplazar una canción bloqueada, y llega a los demás", async () => {
  const { host, guest } = await room();
  const a = { videoId: "K5VZGDyX_qs", title: "Bloqueada", channel: "" };
  host.emit("add-song", { song: a });
  await once(guest, "queue-updated");

  // Un invitado no puede reemplazar
  let guestReplaced = false;
  host.once("song-replaced", () => { guestReplaced = true; });
  guest.emit("replace-song", { index: 0, song: { videoId: "zSeVzG-n6IQ", title: "Otra", channel: "" } });

  // El anfitrión sí; un id inválido se ignora
  const replaced = once(guest, "song-replaced");
  host.emit("replace-song", { index: 0, song: { videoId: "../x", title: "mal" } });
  host.emit("replace-song", { index: 0, song: { videoId: "zSeVzG-n6IQ", title: "De Niña a Mujer", channel: "VEVO" } });
  const data = await replaced;
  assert.equal(data.index, 0);
  assert.equal(data.song.videoId, "zSeVzG-n6IQ");
  assert.equal(guestReplaced, false);
});

// ── Reglas de las salas ───────────────────────────────────────

test("la sala tiene nombre y el anfitrión recibe su llave secreta", async () => {
  const host = client();
  host.emit("create-session", { name: "Gym", roomName: "Mañana · cardio" });
  const created = await once(host, "session-created");
  assert.equal(created.roomName, "Mañana · cardio");
  assert.match(created.hostKey, /^[0-9a-f]{32}$/);
  assert.equal(created.isHost, true);
});

test("si el anfitrión se va, nadie más toma el control y puede volver con su llave", async () => {
  const host = client();
  host.emit("create-session", { name: "Gym", roomName: "Pesas" });
  const { code, hostKey } = await once(host, "session-created");
  const guest = client();
  guest.emit("join-session", { code, name: "Luis" });
  const joined = await once(guest, "session-joined");
  assert.equal(joined.isHost, false);

  const offline = once(guest, "host-status");
  host.emit("leave-session");
  assert.equal((await offline).online, false);
  assert.equal(sessions.get(code).hostId, null, "el control no pasa al invitado");

  const back = client();
  const online = once(guest, "host-status");
  back.emit("rejoin-session", { code, name: "Gym", hostKey });
  const snap = await once(back, "session-joined");
  assert.equal(snap.isHost, true);
  assert.equal((await online).online, true);

  // Una llave equivocada no da control
  const intruder = client();
  intruder.emit("rejoin-session", { code, name: "Gym", hostKey: "0".repeat(32) });
  assert.equal((await once(intruder, "session-joined")).isHost, false);
});

test("los invitados piden canciones pero no pueden reproducir ni quitar", async () => {
  const { host, guest, code } = await room();
  const song = { videoId: "abcdefghij3", title: "Pedida", channel: "" };
  const added = once(host, "queue-updated");
  guest.emit("add-song", { song });
  assert.equal((await added).playlist[0].addedBy, "Luis");

  guest.emit("play-song", { index: 0 });
  guest.emit("remove-song", { index: 0 });
  await new Promise((r) => setTimeout(r, 200));
  const r = sessions.get(code);
  assert.equal(r.playlist.length, 1, "el invitado no pudo quitarla");
  assert.equal(r.currentIndex, -1, "el invitado no pudo reproducirla");

  const played = once(guest, "song-played");
  host.emit("play-song", { index: 0 });
  assert.equal((await played).index, 0);
});

test("crear o entrar a otra sala saca de la anterior (sin anfitriones fantasma)", async () => {
  const host = client();
  host.emit("create-session", { name: "Gym", roomName: "Uno" });
  const first = await once(host, "session-created");
  host.emit("create-session", { name: "Gym", roomName: "Dos" });
  const second = await once(host, "session-created");
  assert.notEqual(first.code, second.code);
  assert.equal(sessions.get(first.code).hostId, null);
  assert.equal(sessions.get(first.code).participants.length, 0);
  assert.equal(sessions.get(second.code).hostId !== null, true);
});

test("getRoomsStatus informa si cada sala existe y si su anfitrión está", async () => {
  const host = client();
  host.emit("create-session", { name: "Gym", roomName: "Estado" });
  const { code } = await once(host, "session-created");
  const [ok, missing] = getRoomsStatus([code, "ZZZZZZ"]);
  assert.deepEqual(ok, { code, exists: true, name: "Estado", people: 1, hostOnline: true });
  assert.equal(missing.exists, false);
});

test("compartir en el chat pone la canción en la cola, y los votos la adelantan", async () => {
  const { host, guest, code } = await room();
  const song = (id, title) => ({ videoId: id, title, channel: "" });
  // Nada sonando: el anfitrión pone la primera
  host.emit("add-song", { song: song("aaaaaaaaaa1", "Uno") });
  await once(guest, "queue-updated");
  host.emit("play-song", { index: 0 });
  await once(guest, "song-played");

  host.emit("add-song", { song: song("aaaaaaaaaa2", "Dos") });
  await once(guest, "queue-updated");
  const shared = once(host, "queue-updated");
  guest.emit("share-song", { song: song("aaaaaaaaaa3", "Tres") });
  assert.deepEqual((await shared).playlist.map((s) => s.title), ["Uno", "Dos", "Tres"]);

  // Dos votos para "Tres": pasa adelante de "Dos"; "Uno" sigue sonando
  const voted = new Promise((resolve) => {
    let n = 0;
    host.on("queue-updated", (q) => { if (++n === 2) resolve(q); });
  });
  guest.emit("vote-song", { videoId: "aaaaaaaaaa3" });
  host.emit("vote-song", { videoId: "aaaaaaaaaa3" });
  const q = await voted;
  assert.deepEqual(q.playlist.map((s) => s.title), ["Uno", "Tres", "Dos"]);
  assert.equal(q.playlist[1].votes.length, 2);
  assert.equal(sessions.get(code).currentIndex, 0);
});

test("si el anfitrión recarga la página, vuelve como anfitrión sin avisos en el chat", async () => {
  const host = client();
  host.emit("create-session", { name: "Johan", roomName: "Recarga" });
  const { code, hostKey } = await once(host, "session-created");
  const guest = client();
  const seen = [];
  guest.on("chat-message", (m) => seen.push(m.text));
  let offline = false;
  guest.on("host-status", (s) => { if (!s.online) offline = true; });
  guest.emit("join-session", { code, name: "Ana" });
  await once(guest, "session-joined");

  host.close(); // recarga: se cae la conexión
  await new Promise((r) => setTimeout(r, 300));
  const again = client();
  again.emit("rejoin-session", { code, name: "Johan", hostKey });
  const snap = await once(again, "session-joined");
  await new Promise((r) => setTimeout(r, 300));

  assert.equal(snap.isHost, true);
  assert.equal(offline, false, "los invitados no ven al anfitrión desconectado");
  assert.ok(!seen.some((t) => /desconectó|volvió/.test(t)), "sin avisos de desconexión en el chat");
});

test("votar una canción que ya sonó o que no está explica por qué", async () => {
  const { host, guest } = await room();
  host.emit("add-song", { song: { videoId: "bbbbbbbbbb1", title: "Uno", channel: "" } });
  await once(guest, "queue-updated");
  host.emit("play-song", { index: 0 });
  await once(guest, "song-played");

  const playing = once(guest, "vote-error");
  guest.emit("vote-song", { videoId: "bbbbbbbbbb1" });
  assert.match((await playing).message, /sonando/);

  const missing = once(guest, "vote-error");
  guest.emit("vote-song", { videoId: "zzzzzzzzzz9" });
  assert.match((await missing).message, /no está en la cola/);
});

test("una versión reemplazada recuerda el id original", async () => {
  const { host, guest } = await room();
  host.emit("add-song", { song: { videoId: "K5VZGDyX_qs", title: "Bloqueada", channel: "" } });
  await once(guest, "queue-updated");
  const updated = new Promise((resolve) => guest.on("queue-updated", (q) => { if (q.playlist[0].videoId === "zSeVzG-n6IQ") resolve(q); }));
  host.emit("replace-song", { index: 0, song: { videoId: "zSeVzG-n6IQ", title: "Oficial", channel: "VEVO" } });
  const q = await updated;
  assert.deepEqual(q.playlist[0].replacedFrom, ["K5VZGDyX_qs"]);
});

test("si el anfitrión pone a mano una canción de más abajo, las que se saltó siguen en espera", async () => {
  const { host, guest, code } = await room();
  const song = (id, title) => ({ videoId: id, title, channel: "" });
  for (const [id, title] of [["bbbbbbbbbb1", "Uno"], ["bbbbbbbbbb2", "Dos"], ["bbbbbbbbbb3", "Tres"], ["bbbbbbbbbb4", "Cuatro"]]) {
    host.emit("add-song", { song: song(id, title) });
    await once(guest, "queue-updated");
  }
  host.emit("play-song", { index: 0 });
  await once(guest, "song-played");

  // Salta de "Uno" a "Cuatro": "Dos" y "Tres" no sonaron
  const queue = once(guest, "queue-updated");
  const played = once(guest, "song-played");
  host.emit("play-song", { index: 3 });
  const q = await queue;
  assert.deepEqual(q.playlist.map((s) => s.title), ["Uno", "Cuatro", "Dos", "Tres"]);
  assert.equal(q.currentIndex, 1);
  assert.equal((await played).index, 1);
  assert.equal(sessions.get(code).currentIndex, 1);

  // Y se pueden seguir votando
  const voted = once(guest, "queue-updated");
  guest.emit("vote-song", { videoId: "bbbbbbbbbb3" });
  assert.deepEqual((await voted).playlist.map((s) => s.title), ["Uno", "Cuatro", "Tres", "Dos"]);
});

// ── Personas: expulsar, co-anfitriones y pasar el mando ──

test("el anfitrión expulsa a un invitado: sale de la sala y ya no puede actuar en ella", async () => {
  const { host, guest, code } = await room();
  const guestId = guest.id;
  const kicked = once(guest, "kicked");
  const left = once(host, "participant-left");
  host.emit("kick-participant", { id: guestId });
  assert.equal((await kicked).code, code);
  assert.ok(!(await left).participants.some((p) => p.id === guestId));

  // Si intenta agregar una canción, no pasa nada
  guest.emit("add-song", { song: { videoId: "ccccccccccc", title: "X", channel: "" } });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(sessions.get(code).playlist.length, 0);
});

test("un invitado no puede expulsar ni nombrar co-anfitriones", async () => {
  const { host, guest, code } = await room();
  guest.emit("kick-participant", { id: host.id });
  guest.emit("set-cohost", { id: guest.id, on: true });
  await new Promise((r) => setTimeout(r, 100));
  const r = sessions.get(code);
  assert.equal(r.participants.length, 2);
  assert.deepEqual(r.cohostKeys, []);
});

test("co-anfitrión: maneja la música del anfitrión, quita canciones y vuelve con su llave", async () => {
  const { host, guest, code } = await room();
  const granted = once(guest, "cohost-granted");
  const updated = once(host, "participant-updated");
  host.emit("set-cohost", { id: guest.id, on: true });
  const { cohostKey } = await granted;
  assert.ok(cohostKey);
  assert.equal((await updated).participants.find((p) => p.id === guest.id).isCohost, true);

  // Sus controles llegan al dispositivo del anfitrión, que es donde suena
  const command = once(host, "host-command");
  guest.emit("host-command", { action: "next" });
  assert.deepEqual(await command, { action: "next", by: "Luis" });

  // Puede quitar canciones de la cola
  host.emit("add-song", { song: { videoId: "ddddddddddd", title: "D", channel: "" } });
  await once(guest, "queue-updated");
  const removed = once(host, "queue-updated");
  guest.emit("remove-song", { index: 0 });
  assert.equal((await removed).playlist.length, 0);

  // Recarga la página: vuelve como co-anfitrión con su llave
  guest.close();
  const again = client();
  again.emit("rejoin-session", { code, name: "Luis", cohostKey });
  assert.equal((await once(again, "session-joined")).isCohost, true);

  // El anfitrión le quita el rol: la llave deja de servir
  const revoked = once(again, "cohost-revoked");
  host.emit("set-cohost", { id: again.id, on: false });
  await revoked;
  assert.deepEqual(sessions.get(code).cohostKeys, []);
});

test("un invitado normal no puede mandar comandos al anfitrión", async () => {
  const { host, guest } = await room();
  let got = false;
  host.on("host-command", () => (got = true));
  guest.emit("host-command", { action: "toggle" });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(got, false);
});

test("pasar el mando: la otra persona queda de anfitrión y la llave vieja deja de servir", async () => {
  const host = client();
  host.emit("create-session", { name: "Ana", roomName: "Mando" });
  const { code, hostKey: oldKey } = await once(host, "session-created");
  const guest = client();
  guest.emit("join-session", { code, name: "Luis" });
  await once(guest, "session-joined");

  const granted = once(guest, "host-granted");
  const revoked = once(host, "host-revoked");
  host.emit("transfer-host", { id: guest.id });
  const { hostKey, state } = await granted;
  await revoked;
  assert.notEqual(hostKey, oldKey);
  assert.ok(Array.isArray(state.playlist));
  const r = sessions.get(code);
  assert.equal(r.hostId, guest.id);
  assert.equal(r.participants.find((p) => p.id === host.id).isHost, false);

  // El anfitrión anterior ya no manda: sus comandos de anfitrión se ignoran
  host.emit("play-song", { index: 0 });
  host.emit("transfer-host", { id: host.id });
  await new Promise((r2) => setTimeout(r2, 100));
  assert.equal(sessions.get(code).hostId, guest.id);

  // Y su llave vieja ya no lo hace anfitrión
  const other = client();
  other.emit("rejoin-session", { code, name: "Ana", hostKey: oldKey });
  assert.equal((await once(other, "session-joined")).isHost, false);
});
