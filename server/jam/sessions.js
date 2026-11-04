"use strict";

// Salas: un anfitrión pone la música en su dispositivo y los invitados son
// control remoto (piden canciones, chatean, reaccionan). Todo por Socket.IO.
//
// Reglas:
// - Solo suena en el dispositivo del anfitrión. Los invitados nunca reproducen audio.
// - Reproducir, saltar, pausar y quitar canciones es solo del anfitrión.
// - El anfitrión se identifica con una llave secreta (hostKey) que recibe al crear
//   la sala; con ella puede volver desde cualquier recarga o desde "Mis salas".
// - Si el anfitrión se va, la sala espera: el control NUNCA pasa a un invitado.
// - Una persona puede tener varias salas, pero cada conexión está en una a la vez.
// - Las salas vacías duran ROOM_TTL_MS sin actividad; con DATA_DIR se guardan en disco.

const crypto = require("crypto");
const chat = require("./chat");
const { createRoomStore } = require("./store");
const { orderQueue, toggleVote } = require("./queue-order");

const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GUEST_GRACE_MS = 5 * 60 * 1000;
const MAX_QUEUE = 300;

/** @type {Map<string, any>} */
const sessions = new Map();
// 8 mensajes cada 10 s por persona: suficiente para conversar, corta el spam.
const chatLimiter = new chat.RateLimiter({ limit: 8, windowMs: 10_000 });

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
  } while (sessions.has(code));
  return code;
}

function newRoom({ code = generateCode(), name, hostKey = crypto.randomBytes(16).toString("hex"), playlist = [], currentIndex = -1, messages = [], createdAt = Date.now(), lastActiveAt = Date.now() }) {
  return {
    sessionId: `jam_${code}`,
    code,
    name: chat.cleanText(name, 40) || "Sala sin nombre",
    hostKey,
    hostId: null,
    participants: [],
    playlist: Array.isArray(playlist) ? playlist.slice(0, MAX_QUEUE) : [],
    currentIndex: Number.isInteger(currentIndex) ? currentIndex : -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    lastUpdated: Date.now(),
    messages: Array.isArray(messages) ? messages : [],
    createdAt,
    lastActiveAt,
  };
}

const active = (room) => room.participants.filter((p) => !p.disconnectedAt);
const participantOf = (room, socketId) => room.participants.find((p) => p.id === socketId);
const publicParticipants = (room) =>
  active(room).map(({ id, name, isHost }) => ({ id, name, isHost, listenLocally: isHost }));

function estimatedTime(room) {
  return room.isPlaying && room.lastUpdated ? room.currentTime + (Date.now() - room.lastUpdated) / 1000 : room.currentTime;
}

/** Estado para quien entra o vuelve a la sala. */
function roomSnapshot(room, socketId) {
  return {
    sessionId: room.sessionId,
    code: room.code,
    roomName: room.name,
    participants: publicParticipants(room),
    isHost: room.hostId === socketId,
    hostOnline: !!room.hostId,
    messages: room.messages,
  };
}

function syncState(room) {
  return {
    playlist: room.playlist,
    currentIndex: room.currentIndex,
    isPlaying: room.isPlaying,
    currentTime: estimatedTime(room),
    duration: room.duration || 0,
  };
}

/** Estado público de varias salas (para "Mis salas"). */
function getRoomsStatus(codes) {
  return (Array.isArray(codes) ? codes : [])
    .filter((c) => typeof c === "string")
    .slice(0, 50)
    .map((code) => {
      const room = sessions.get(code.toUpperCase());
      return room
        ? { code: room.code, exists: true, name: room.name, people: active(room).length, hostOnline: !!room.hostId }
        : { code, exists: false };
    });
}

/**
 * @param {import("socket.io").Server} io
 * @param {{ store?: ReturnType<typeof createRoomStore>, now?: () => number }} [opts]
 */
function registerJamHandlers(io, { store = createRoomStore() } = {}) {
  for (const saved of store.load()) {
    if (saved?.code && !sessions.has(saved.code)) sessions.set(saved.code, newRoom(saved));
  }
  const persist = () => store.scheduleSave(() => [...sessions.values()]);

  const touch = (room) => {
    room.lastActiveAt = Date.now();
    persist();
  };

  const postMessage = (room, message) => {
    chat.appendMessage(room.messages, message);
    io.to(room.sessionId).emit("chat-message", message);
    touch(room);
  };
  const systemMessage = (room, text) => postMessage(room, chat.createMessage({ type: "system", author: "", text }));
  const broadcastPeople = (room, event = "participant-joined") =>
    io.to(room.sessionId).emit(event, { participants: publicParticipants(room) });
  const broadcastHost = (room) => io.to(room.sessionId).emit("host-status", { online: !!room.hostId });
  /** Ordena la cola por votos y la envía completa a todos: así nadie queda con otro orden. */
  const broadcastQueue = (room) => {
    room.playlist = orderQueue(room.playlist, room.currentIndex);
    io.to(room.sessionId).emit("queue-updated", { playlist: room.playlist, currentIndex: room.currentIndex });
    touch(room);
  };
  /** Agrega una canción pedida (si no estaba). Devuelve la entrada, o null. */
  const enqueue = (room, me, song, source) => {
    const clean = chat.cleanSong(song);
    if (!clean || room.playlist.length >= MAX_QUEUE) return null;
    if (room.playlist.some((s) => s.videoId === clean.videoId)) return null;
    const entry = { ...clean, ...(source === "radio" ? { source: "radio" } : {}), addedBy: me.name, addedAt: Date.now(), votes: [] };
    room.playlist.push(entry);
    return entry;
  };

  // Limpia salas vacías e inactivas.
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of sessions) {
      if (active(room).length === 0 && room.lastActiveAt < cutoff) sessions.delete(code);
    }
    persist();
  }, 60 * 60 * 1000);
  sweeper.unref?.();

  io.on("connection", (socket) => {
    let currentCode = null;
    const current = () => (currentCode ? sessions.get(currentCode) : null);
    const isHostOf = (room) => room && room.hostId === socket.id;

    /** Sale de la sala actual (si hay) antes de entrar a otra. */
    const leaveCurrent = ({ graceful }) => {
      const room = current();
      if (!room) return;
      const me = participantOf(room, socket.id);
      socket.leave(room.sessionId);
      currentCode = null;
      chatLimiter.forget(socket.id);
      if (!me) return;

      if (me.isHost) {
        // El anfitrión se va: la música se pausa y la sala espera su regreso.
        room.participants = room.participants.filter((p) => p !== me);
        room.hostId = null;
        room.isPlaying = false;
        broadcastHost(room);
        broadcastPeople(room, "participant-left");
        systemMessage(room, graceful ? "El anfitrión se desconectó. La música vuelve cuando regrese." : `${me.name} cerró la sala por ahora. La música vuelve cuando regrese.`);
        return;
      }

      if (graceful) {
        // Invitado desconectado: se le guarda el lugar unos minutos por si vuelve.
        me.disconnectedAt = Date.now();
        broadcastPeople(room, "participant-disconnected");
        me.disconnectTimer = setTimeout(() => {
          if (!room.participants.includes(me) || !me.disconnectedAt) return;
          room.participants = room.participants.filter((p) => p !== me);
          broadcastPeople(room, "participant-left");
          systemMessage(room, `${me.name} salió de la sala`);
        }, GUEST_GRACE_MS);
        me.disconnectTimer.unref?.();
        return;
      }

      room.participants = room.participants.filter((p) => p !== me);
      broadcastPeople(room, "participant-left");
      systemMessage(room, `${me.name} salió de la sala`);
    };

    const enter = (room, participant, event) => {
      room.participants.push(participant);
      currentCode = room.code;
      socket.join(room.sessionId);
      socket.emit(event, roomSnapshot(room, socket.id));
      socket.emit("sync-state", syncState(room));
      broadcastPeople(room);
    };

    socket.on("create-session", ({ name, roomName, playlist, currentIndex } = {}) => {
      leaveCurrent({ graceful: false });
      const room = newRoom({ name: roomName, playlist: (Array.isArray(playlist) ? playlist : []).map(chat.cleanSong).filter(Boolean), currentIndex });
      sessions.set(room.code, room);
      room.hostId = socket.id;
      const me = { id: socket.id, name: chat.cleanName(name, "Anfitrión"), isHost: true };
      room.participants.push(me);
      currentCode = room.code;
      socket.join(room.sessionId);
      socket.emit("session-created", { ...roomSnapshot(room, socket.id), hostKey: room.hostKey });
      systemMessage(room, `${me.name} abrió «${room.name}»`);
      broadcastPeople(room);
    });

    socket.on("join-session", ({ code, name } = {}) => {
      const room = typeof code === "string" ? sessions.get(code.trim().toUpperCase()) : null;
      if (!room) return socket.emit("error", { message: "No encontré esa sala. Revisa el código." });
      leaveCurrent({ graceful: false });
      const me = { id: socket.id, name: chat.cleanName(name), isHost: false };
      enter(room, me, "session-joined");
      systemMessage(room, `${me.name} se unió a la sala`);
    });

    // Volver a una sala: como anfitrión (con su llave) o como invitado (por nombre).
    socket.on("rejoin-session", ({ code, name, hostKey } = {}) => {
      const room = typeof code === "string" ? sessions.get(code.trim().toUpperCase()) : null;
      if (!room) return socket.emit("session-expired", { code });
      if (currentCode !== room.code) leaveCurrent({ graceful: false });

      const asHost = typeof hostKey === "string" && hostKey.length > 0 && hostKey === room.hostKey;
      if (asHost) {
        // Si había otra conexión del anfitrión (otra pestaña), la nueva toma el control.
        room.participants = room.participants.filter((p) => !p.isHost);
        room.hostId = socket.id;
        enter(room, { id: socket.id, name: chat.cleanName(name, "Anfitrión"), isHost: true }, "session-joined");
        broadcastHost(room);
        systemMessage(room, "El anfitrión volvió 🎶");
        return;
      }

      const waiting = room.participants.find((p) => !p.isHost && p.disconnectedAt && p.name === chat.cleanName(name));
      if (waiting) {
        clearTimeout(waiting.disconnectTimer);
        room.participants = room.participants.filter((p) => p !== waiting);
      }
      enter(room, { id: socket.id, name: chat.cleanName(name), isHost: false }, "session-joined");
    });

    socket.on("leave-session", () => leaveCurrent({ graceful: false }));
    socket.on("disconnect", () => leaveCurrent({ graceful: true }));

    // ── Cola ────────────────────────────────────────────────

    socket.on("add-song", ({ song } = {}) => {
      const room = current();
      const me = room && participantOf(room, socket.id);
      if (!me) return;
      const entry = enqueue(room, me, song, song?.source);
      if (!entry) return;
      broadcastQueue(room);
      if (entry.source !== "radio") systemMessage(room, `${me.name} agregó «${entry.title}» a la cola`);
    });

    // Votar sube una canción en la cola: la más votada de las que esperan suena primero.
    socket.on("vote-song", ({ videoId } = {}) => {
      const room = current();
      const me = room && participantOf(room, socket.id);
      if (me && toggleVote(room.playlist, room.currentIndex, videoId, me.id)) broadcastQueue(room);
    });

    socket.on("remove-song", ({ index } = {}) => {
      const room = current();
      if (!isHostOf(room) || !Number.isInteger(index) || index < 0 || index >= room.playlist.length) return;
      room.playlist.splice(index, 1);
      if (index < room.currentIndex) room.currentIndex--;
      else if (index === room.currentIndex) room.currentIndex = -1;
      broadcastQueue(room);
    });

    socket.on("play-song", ({ index } = {}) => {
      const room = current();
      if (!isHostOf(room) || !Number.isInteger(index) || index < 0 || index >= room.playlist.length) return;
      Object.assign(room, { currentIndex: index, isPlaying: true, currentTime: 0, lastUpdated: Date.now() });
      socket.to(room.sessionId).emit("song-played", { index });
      broadcastQueue(room);
    });

    socket.on("replace-song", ({ index, song } = {}) => {
      const room = current();
      const clean = chat.cleanSong(song);
      if (!isHostOf(room) || !clean || !Number.isInteger(index) || index < 0 || index >= room.playlist.length) return;
      const old = room.playlist[index];
      room.playlist[index] = { ...old, ...clean };
      socket.to(room.sessionId).emit("song-replaced", { index, song: room.playlist[index] });
      broadcastQueue(room);
    });

    // ── Reproducción (solo anfitrión) ───────────────────────

    const playback = (event, update, emit) =>
      socket.on(event, (payload = {}) => {
        const room = current();
        if (!isHostOf(room) || typeof payload.currentTime !== "number") return;
        update(room, payload);
        room.lastUpdated = Date.now();
        socket.to(room.sessionId).emit(emit, emit === "playback-synced"
          ? { currentTime: room.currentTime, duration: room.duration, isPlaying: room.isPlaying }
          : { currentTime: room.currentTime });
      });

    playback("pause-song", (r, p) => Object.assign(r, { isPlaying: false, currentTime: p.currentTime }), "song-paused");
    playback("resume-song", (r, p) => Object.assign(r, { isPlaying: true, currentTime: p.currentTime }), "song-resumed");
    playback("seek-song", (r, p) => Object.assign(r, { currentTime: p.currentTime }), "song-seeked");
    playback("sync-playback", (r, p) => {
      Object.assign(r, { currentTime: p.currentTime, isPlaying: !!p.isPlaying });
      if (p.duration) r.duration = p.duration;
    }, "playback-synced");

    // ── Chat ────────────────────────────────────────────────

    const withMe = (handler) => (payload = {}) => {
      const room = current();
      const me = room && participantOf(room, socket.id);
      if (me) handler(room, me, payload);
    };

    const allowed = () => {
      if (chatLimiter.allow(socket.id)) return true;
      socket.emit("chat-error", { message: "Vas muy rápido. Espera unos segundos." });
      return false;
    };

    socket.on("chat-message", withMe((room, me, { text }) => {
      const clean = chat.cleanText(text);
      if (!clean || !allowed()) return;
      postMessage(room, chat.createMessage({ type: "text", author: me.name, authorId: me.id, text: clean }));
    }));

    // Compartir una canción en el chat también la pide: queda en la cola para votar.
    socket.on("share-song", withMe((room, me, { song, text }) => {
      const clean = chat.cleanSong(song);
      if (!clean || !allowed()) return;
      postMessage(room, chat.createMessage({ type: "song", author: me.name, authorId: me.id, song: clean, text: chat.cleanText(text) || "" }));
      if (enqueue(room, me, clean)) broadcastQueue(room);
    }));

    socket.on("react", withMe((room, me, { messageId, emoji }) => {
      const updated = chat.toggleReaction(room.messages, messageId, emoji, me.id);
      if (updated) {
        io.to(room.sessionId).emit("chat-reaction", { messageId, reactions: updated.reactions });
        touch(room);
      }
    }));

    socket.on("typing", withMe((room, me) => {
      socket.to(room.sessionId).emit("typing", { id: me.id, name: me.name });
    }));
  });

  return { persistNow: () => store.saveNow([...sessions.values()]) };
}

module.exports = { registerJamHandlers, getRoomsStatus, sessions, ROOM_TTL_MS };
