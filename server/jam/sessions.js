"use strict";

// Salas: un anfitrión pone la música en su dispositivo y los invitados son
// control remoto (piden canciones, chatean, reaccionan). Todo por Socket.IO.
//
// Reglas:
// - Solo suena en el dispositivo del anfitrión. Los invitados nunca reproducen audio.
// - Reproducir, saltar, pausar y quitar canciones es solo del anfitrión.
// - El anfitrión se identifica con una llave secreta (hostKey) que recibe al crear
//   la sala; con ella puede volver desde cualquier recarga o desde "Mis salas".
// - Si el anfitrión se va, la sala espera: el control solo pasa a otra persona si el
//   anfitrión le "pasa el mando" (y entonces la música suena en el dispositivo de ella).
// - Co-anfitriones: manejan la sala desde su celular (pausar, saltar, poner, quitar,
//   expulsar), pero la música sigue sonando en el dispositivo del anfitrión. Vuelven
//   con su propia llave (cohostKey), que el anfitrión puede quitarles.
// - Una persona puede tener varias salas, pero cada conexión está en una a la vez.
// - Las salas vacías duran ROOM_TTL_MS sin actividad; con DATA_DIR se guardan en disco.

const crypto = require("crypto");
const chat = require("./chat");
const { createRoomStore } = require("./store");
const { orderQueue, toggleVote, playNow } = require("./queue-order");

const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GUEST_GRACE_MS = 5 * 60 * 1000;
/** Tiempo para que el anfitrión vuelva (p. ej. al recargar) sin que la sala lo note. */
const HOST_GRACE_MS = 20 * 1000;
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

const newKey = () => crypto.randomBytes(16).toString("hex");
const HOST_COMMANDS = new Set(["toggle", "next", "prev", "play"]);

function newRoom({ code = generateCode(), name, hostKey = newKey(), cohostKeys = [], playlist = [], currentIndex = -1, messages = [], createdAt = Date.now(), lastActiveAt = Date.now() }) {
  return {
    sessionId: `jam_${code}`,
    code,
    name: chat.cleanText(name, 40) || "Sala sin nombre",
    hostKey,
    cohostKeys: Array.isArray(cohostKeys) ? cohostKeys.filter((k) => typeof k === "string") : [],
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
  active(room).map(({ id, name, isHost, isCohost }) => ({ id, name, isHost, isCohost: !!isCohost, listenLocally: isHost }));

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
    isCohost: !!participantOf(room, socketId)?.isCohost,
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
    /** Anfitrión o co-anfitrión de la sala. */
    const canControl = (room) => {
      const me = room && participantOf(room, socket.id);
      return !!me && (me.isHost || !!me.isCohost);
    };

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
        room.participants = room.participants.filter((p) => p !== me);
        const goOffline = (text) => {
          room.hostId = null;
          room.isPlaying = false;
          broadcastHost(room);
          broadcastPeople(room, "participant-left");
          systemMessage(room, text);
        };
        if (!graceful) {
          goOffline(`${me.name} cerró la sala por ahora. La música vuelve cuando regrese.`);
          return;
        }
        // Se cayó la conexión o recargó la página: se le dan unos segundos para volver
        // sin avisar a nadie. Solo si no vuelve, la sala queda esperando.
        const leftId = socket.id;
        const timer = setTimeout(() => {
          if (room.hostId === leftId) goOffline("El anfitrión se desconectó. La música vuelve cuando regrese.");
        }, HOST_GRACE_MS);
        timer.unref?.();
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
    socket.on("rejoin-session", ({ code, name, hostKey, cohostKey } = {}) => {
      const room = typeof code === "string" ? sessions.get(code.trim().toUpperCase()) : null;
      if (!room) return socket.emit("session-expired", { code });
      if (currentCode !== room.code) leaveCurrent({ graceful: false });

      const asHost = typeof hostKey === "string" && hostKey.length > 0 && hostKey === room.hostKey;
      if (asHost) {
        // Si había otra conexión del anfitrión (otra pestaña), la nueva toma el control.
        const wasOffline = !room.hostId;
        room.participants = room.participants.filter((p) => !p.isHost);
        room.hostId = socket.id;
        enter(room, { id: socket.id, name: chat.cleanName(name, "Anfitrión"), isHost: true }, "session-joined");
        broadcastHost(room);
        // Si volvió dentro del tiempo de gracia (una recarga), nadie se enteró: no hace falta avisar.
        if (wasOffline) systemMessage(room, "El anfitrión volvió 🎶");
        return;
      }

      const waiting = room.participants.find((p) => !p.isHost && p.disconnectedAt && p.name === chat.cleanName(name));
      if (waiting) {
        clearTimeout(waiting.disconnectTimer);
        room.participants = room.participants.filter((p) => p !== waiting);
      }
      const guest = { id: socket.id, name: chat.cleanName(name), isHost: false };
      if (typeof cohostKey === "string" && room.cohostKeys.includes(cohostKey)) {
        // Si otra conexión tenía la misma llave (otra pestaña), la nueva se queda con ella.
        for (const p of room.participants) if (p.cohostKey === cohostKey) Object.assign(p, { isCohost: false, cohostKey: undefined });
        Object.assign(guest, { isCohost: true, cohostKey });
      }
      enter(room, guest, "session-joined");
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
      if (!me) return;
      if (toggleVote(room.playlist, room.currentIndex, videoId, me.id)) return broadcastQueue(room);
      // Antes fallaba en silencio: ahora se explica por qué no se pudo votar.
      const index = room.playlist.findIndex((s) => s.videoId === videoId);
      const reason = index < 0 ? "Esa canción ya no está en la cola. Puedes volver a pedirla."
        : index === room.currentIndex ? "Esa canción ya está sonando 🎶"
        : "Esa canción ya sonó. Puedes volver a pedirla.";
      socket.emit("vote-error", { videoId, message: reason });
    });

    socket.on("remove-song", ({ index } = {}) => {
      const room = current();
      if (!canControl(room) || !Number.isInteger(index) || index < 0 || index >= room.playlist.length) return;
      room.playlist.splice(index, 1);
      if (index < room.currentIndex) room.currentIndex--;
      else if (index === room.currentIndex) room.currentIndex = -1;
      broadcastQueue(room);
    });

    socket.on("play-song", ({ index } = {}) => {
      const room = current();
      if (!isHostOf(room) || !Number.isInteger(index) || index < 0 || index >= room.playlist.length) return;
      const playing = playNow(room.playlist, room.currentIndex, index);
      Object.assign(room, { currentIndex: playing, isPlaying: true, currentTime: 0, lastUpdated: Date.now() });
      // Primero la cola reordenada y luego qué suena, para que el índice coincida.
      broadcastQueue(room);
      socket.to(room.sessionId).emit("song-played", { index: room.currentIndex });
    });

    socket.on("replace-song", ({ index, song } = {}) => {
      const room = current();
      const clean = chat.cleanSong(song);
      if (!isHostOf(room) || !clean || !Number.isInteger(index) || index < 0 || index >= room.playlist.length) return;
      const old = room.playlist[index];
      // Recuerda qué versión reemplazó, para que la tarjeta del chat siga encontrándola.
      const replacedFrom = [...new Set([...(old.replacedFrom ?? []), old.videoId])].slice(-5);
      room.playlist[index] = { ...old, ...clean, replacedFrom };
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

    // ── Personas: expulsar, co-anfitriones y pasar el mando ──

    /** Quien está conectado ahora en la sala con ese id. */
    const target = (room, id) => room.participants.find((p) => p.id === id && !p.disconnectedAt);

    const dropCohostKey = (room, p) => {
      if (p.cohostKey) room.cohostKeys = room.cohostKeys.filter((k) => k !== p.cohostKey);
      Object.assign(p, { isCohost: false, cohostKey: undefined });
    };

    // Anfitrión o co-anfitrión sacan a alguien. Al anfitrión nadie lo saca, y un
    // co-anfitrión no saca a otro co-anfitrión.
    socket.on("kick-participant", ({ id } = {}) => {
      const room = current();
      const me = room && participantOf(room, socket.id);
      const who = room && target(room, id);
      if (!me || !who || who === me || !canControl(room) || who.isHost) return;
      if (who.isCohost && !me.isHost) return;
      dropCohostKey(room, who);
      clearTimeout(who.disconnectTimer);
      room.participants = room.participants.filter((p) => p !== who);
      const theirs = io.sockets.sockets.get(who.id);
      theirs?.emit("kicked", { code: room.code, by: me.name });
      theirs?.leave(room.sessionId);
      broadcastPeople(room, "participant-left");
      systemMessage(room, `${me.name} sacó a ${who.name} de la sala`);
    });

    // El anfitrión nombra (o quita) co-anfitriones.
    socket.on("set-cohost", ({ id, on } = {}) => {
      const room = current();
      const who = room && target(room, id);
      if (!isHostOf(room) || !who || who.isHost) return;
      const me = participantOf(room, socket.id);
      const theirs = io.sockets.sockets.get(who.id);
      if (on) {
        if (who.isCohost) return;
        const key = newKey();
        room.cohostKeys.push(key);
        Object.assign(who, { isCohost: true, cohostKey: key });
        theirs?.emit("cohost-granted", { code: room.code, roomName: room.name, cohostKey: key });
        systemMessage(room, `${me.name} hizo co-anfitrión a ${who.name} 🎛️`);
      } else {
        if (!who.isCohost) return;
        dropCohostKey(room, who);
        theirs?.emit("cohost-revoked", { code: room.code });
        systemMessage(room, `${who.name} ya no es co-anfitrión`);
      }
      broadcastPeople(room, "participant-updated");
      touch(room);
    });

    // Pasar el mando: la música pasa a sonar en el dispositivo de la otra persona y la
    // llave cambia, así que el anfitrión anterior queda como invitado.
    socket.on("transfer-host", ({ id } = {}) => {
      const room = current();
      const who = room && target(room, id);
      const me = room && participantOf(room, socket.id);
      if (!isHostOf(room) || !who || who === me) return;
      dropCohostKey(room, who);
      room.hostKey = newKey();
      me.isHost = false;
      who.isHost = true;
      room.hostId = who.id;
      io.sockets.sockets.get(who.id)?.emit("host-granted", { code: room.code, roomName: room.name, hostKey: room.hostKey, state: syncState(room) });
      socket.emit("host-revoked", { code: room.code });
      broadcastPeople(room, "participant-updated");
      broadcastHost(room);
      systemMessage(room, `${me.name} le pasó el mando a ${who.name} 🎚️`);
    });

    // El co-anfitrión maneja la música, que suena en el dispositivo del anfitrión.
    socket.on("host-command", ({ action, videoId } = {}) => {
      const room = current();
      const me = room && participantOf(room, socket.id);
      if (!me?.isCohost || !HOST_COMMANDS.has(action)) return;
      // "play" va por id y no por posición: la cola se reordena con los votos.
      if (action === "play" && !room.playlist.some((s) => s.videoId === videoId)) return;
      if (!room.hostId) {
        socket.emit("command-error", { message: "El anfitrión no está conectado: la música vuelve cuando regrese." });
        return;
      }
      io.to(room.hostId).emit("host-command", { action, ...(action === "play" ? { videoId } : {}), by: me.name });
    });

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
