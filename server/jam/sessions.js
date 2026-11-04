"use strict";

// Sesiones Jam: varias personas comparten una cola y la reproducción en tiempo
// real vía Socket.IO. El estado vive en memoria (se pierde al reiniciar).

const sessions = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function registerJamHandlers(io) {
io.on("connection", (socket) => {
  let currentSession = null;

  socket.on("create-session", ({ name, playlist, currentIndex, currentTime, duration, isPlaying }) => {
    const code = generateCode();
    const sessionId = `jam_${code}`;
    const participant = { id: socket.id, name: name || "Host", isHost: true };
    const session = {
      sessionId,
      code,
      hostId: socket.id,
      participants: [participant],
      playlist: Array.isArray(playlist) ? playlist : [],
      currentIndex: typeof currentIndex === "number" ? currentIndex : -1,
      isPlaying: !!isPlaying,
      currentTime: currentTime || 0,
      duration: duration || 0,
      lastUpdated: Date.now(),
    };
    sessions.set(code, session);
    currentSession = code;
    socket.join(sessionId);
    socket.emit("session-created", { sessionId, code });
    io.to(sessionId).emit("participant-joined", {
      participants: session.participants,
    });
  });

  socket.on("join-session", ({ code, name, listenLocally }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit("error", { message: "Sesion no encontrada" });
      return;
    }
    const participant = {
      id: socket.id,
      name: name || "Invitado",
      isHost: false,
      listenLocally: listenLocally !== false,
    };
    session.participants.push(participant);
    currentSession = code;
    socket.join(session.sessionId);
    socket.emit("session-joined", {
      sessionId: session.sessionId,
      code: session.code,
      participants: session.participants,
    });
    // Sync existing state to new participant
    let estimatedTime = session.currentTime;
    if (session.isPlaying && session.lastUpdated) {
      estimatedTime += (Date.now() - session.lastUpdated) / 1000;
    }
    socket.emit("sync-state", {
      playlist: session.playlist,
      currentIndex: session.currentIndex,
      isPlaying: session.isPlaying,
      currentTime: estimatedTime,
      duration: session.duration || 0,
    });
    io.to(session.sessionId).emit("participant-joined", {
      participants: session.participants,
    });
  });

  socket.on("add-song", ({ song }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    // Broadcast to all others in the session
    socket.to(session.sessionId).emit("song-added", { song });
    session.playlist.push(song);
  });

  socket.on("remove-song", ({ index }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    socket.to(session.sessionId).emit("song-removed", { index });
    session.playlist.splice(index, 1);
  });

  socket.on("play-song", ({ index }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    // Any participant can select which song to play
    session.currentIndex = index;
    session.isPlaying = true;
    session.currentTime = 0;
    session.lastUpdated = Date.now();
    socket.to(session.sessionId).emit("song-played", { index });
  });

  socket.on("pause-song", ({ currentTime }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    if (session.hostId !== socket.id) return;
    session.isPlaying = false;
    session.currentTime = currentTime;
    session.lastUpdated = Date.now();
    socket.to(session.sessionId).emit("song-paused", { currentTime });
  });

  socket.on("resume-song", ({ currentTime }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    if (session.hostId !== socket.id) return;
    session.isPlaying = true;
    session.currentTime = currentTime;
    session.lastUpdated = Date.now();
    socket.to(session.sessionId).emit("song-resumed", { currentTime });
  });

  socket.on("seek-song", ({ currentTime }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    if (session.hostId !== socket.id) return;
    session.currentTime = currentTime;
    session.lastUpdated = Date.now();
    socket.to(session.sessionId).emit("song-seeked", { currentTime });
  });

  socket.on("sync-playback", ({ currentTime, duration, isPlaying }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    if (session.hostId !== socket.id) return;
    session.currentTime = currentTime;
    session.isPlaying = isPlaying;
    if (duration) session.duration = duration;
    session.lastUpdated = Date.now();
    socket.to(session.sessionId).emit("playback-synced", { currentTime, duration: session.duration, isPlaying });
  });

  socket.on("update-listen-mode", ({ listenLocally }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    const participant = session.participants.find((p) => p.id === socket.id);
    if (participant) {
      participant.listenLocally = listenLocally;
      io.to(session.sessionId).emit("participant-updated", {
        participants: session.participants.filter((p) => !p.disconnectedAt),
      });
    }
  });

  socket.on("leave-session", () => {
    handleLeaveImmediate(io, socket, currentSession);
    currentSession = null;
  });

  socket.on("disconnect", () => {
    handleDisconnectGraceful(io, socket, currentSession);
  });

  socket.on("rejoin-session", ({ code, name }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit("session-expired");
      return;
    }
    // Find disconnected participant by name
    const existing = session.participants.find(
      (p) => p.name === name && p.disconnectedAt
    );
    if (existing) {
      // Clear grace period timer
      if (existing.disconnectTimer) {
        clearTimeout(existing.disconnectTimer);
        delete existing.disconnectTimer;
      }
      existing.oldSocketId = existing.id;
      existing.id = socket.id;
      delete existing.disconnectedAt;
      if (existing.isHost) {
        session.hostId = socket.id;
      }
    } else {
      // Join as new participant
      const participant = {
        id: socket.id,
        name: name || "Invitado",
        isHost: false,
      };
      session.participants.push(participant);
    }
    currentSession = code;
    socket.join(session.sessionId);
    socket.emit("session-joined", {
      sessionId: session.sessionId,
      code: session.code,
      participants: session.participants.filter((p) => !p.disconnectedAt),
      isHost: session.hostId === socket.id,
    });
    // Sync state
    let estimatedTime = session.currentTime;
    if (session.isPlaying && session.lastUpdated) {
      estimatedTime += (Date.now() - session.lastUpdated) / 1000;
    }
    socket.emit("sync-state", {
      playlist: session.playlist,
      currentIndex: session.currentIndex,
      isPlaying: session.isPlaying,
      currentTime: estimatedTime,
      duration: session.duration || 0,
    });
    io.to(session.sessionId).emit("participant-joined", {
      participants: session.participants.filter((p) => !p.disconnectedAt),
    });
  });
});

}

// Immediate leave (explicit leave-session)
function handleLeaveImmediate(io, socket, code) {
  if (!code) return;
  const session = sessions.get(code);
  if (!session) return;

  session.participants = session.participants.filter(
    (p) => p.id !== socket.id
  );

  if (session.participants.length === 0) {
    sessions.delete(code);
    return;
  }

  // If host left, promote first active participant
  if (session.hostId === socket.id) {
    const active = session.participants.find((p) => !p.disconnectedAt);
    if (active) {
      session.hostId = active.id;
      active.isHost = true;
    }
  }

  io.to(session.sessionId).emit("participant-left", {
    participants: session.participants.filter((p) => !p.disconnectedAt),
  });
}

// Graceful disconnect with 5 min grace period
function handleDisconnectGraceful(io, socket, code) {
  if (!code) return;
  const session = sessions.get(code);
  if (!session) return;

  const participant = session.participants.find((p) => p.id === socket.id);
  if (!participant) return;

  participant.disconnectedAt = Date.now();

  io.to(session.sessionId).emit("participant-disconnected", {
    participants: session.participants.filter((p) => !p.disconnectedAt),
    disconnectedName: participant.name,
  });

  // Grace period: 5 minutes
  participant.disconnectTimer = setTimeout(() => {
    const sess = sessions.get(code);
    if (!sess) return;
    const p = sess.participants.find((pp) => pp.id === socket.id && pp.disconnectedAt);
    if (!p) return;

    sess.participants = sess.participants.filter((pp) => pp.id !== socket.id);

    if (sess.participants.length === 0) {
      sessions.delete(code);
      return;
    }

    if (sess.hostId === socket.id) {
      const active = sess.participants.find((pp) => !pp.disconnectedAt);
      if (active) {
        sess.hostId = active.id;
        active.isHost = true;
      }
    }

    io.to(sess.sessionId).emit("participant-left", {
      participants: sess.participants.filter((pp) => !pp.disconnectedAt),
    });
  }, 5 * 60 * 1000);
  // No retiene el proceso solo por este temporizador (permite cerrar pruebas y apagados limpios).
  participant.disconnectTimer.unref?.();
}

module.exports = { registerJamHandlers, sessions };
