const express = require("express");
const cors = require("cors");
const https = require("https");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const PORT = 3001;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

app.use(cors({ origin: true }));
app.use(express.json());

function youtubeRequest(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "www.youtube.com",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          Origin: "https://www.youtube.com",
          Referer: "https://www.youtube.com/",
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
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            reject(new Error(`YouTube returned ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const INNERTUBE_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20240101.00.00",
    hl: "es",
    gl: "ES",
  },
};

app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const result = await youtubeRequest("/youtubei/v1/search", {
      context: INNERTUBE_CONTEXT,
      query,
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.data);
    }

    const songs = parseSearchResults(result.data);
    res.json({ items: songs });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/video-info", async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: "videoId is required" });

  try {
    const result = await youtubeRequest("/youtubei/v1/player", {
      context: INNERTUBE_CONTEXT,
      videoId,
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.data);
    }

    const details = result.data?.videoDetails;
    res.json({
      videoId,
      title: details?.title || "Video de YouTube",
      channel: details?.author || "",
    });
  } catch (err) {
    console.error("Video info error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

const INNERTUBE_MUSIC_CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    hl: "es",
    gl: "ES",
  },
};

app.post("/api/trending", async (req, res) => {
  try {
    const result = await youtubeRequest("/youtubei/v1/browse", {
      context: INNERTUBE_MUSIC_CONTEXT,
      browseId: "FEmusic_charts",
    });

    if (result.status === 200) {
      const songs = parseTrendingResults(result.data);
      if (songs.length > 0) {
        return res.json({ items: songs });
      }
    }

    // Fallback: search for top hits
    console.log("Trending browse failed or empty, falling back to search");
    const fallback = await youtubeRequest("/youtubei/v1/search", {
      context: INNERTUBE_CONTEXT,
      query: "top hits 2025 music",
    });

    if (fallback.status !== 200) {
      return res.status(fallback.status).json(fallback.data);
    }

    const songs = parseSearchResults(fallback.data);
    res.json({ items: songs });
  } catch (err) {
    console.error("Trending error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

function parseTrendingResults(data) {
  const songs = [];
  try {
    // Navigate the music charts browse response
    const tabs =
      data?.contents?.singleColumnBrowseResultsRenderer?.tabs ||
      data?.contents?.twoColumnBrowseResultsRenderer?.tabs ||
      [];

    for (const tab of tabs) {
      const sections =
        tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of sections) {
        const items =
          section?.musicCarouselShelfRenderer?.contents ||
          section?.musicShelfRenderer?.contents ||
          section?.gridRenderer?.items ||
          [];

        for (const item of items) {
          const video =
            item?.musicResponsiveListItemRenderer ||
            item?.musicTwoRowItemRenderer ||
            null;

          if (!video) continue;

          // Extract videoId from navigation endpoint
          let videoId = null;
          const navEndpoint =
            video?.overlay?.musicItemThumbnailOverlayRenderer?.content
              ?.musicPlayButtonRenderer?.playNavigationEndpoint ||
            video?.navigationEndpoint ||
            null;

          videoId =
            navEndpoint?.watchEndpoint?.videoId ||
            video?.playlistItemData?.videoId ||
            null;

          if (!videoId) continue;

          // Extract title
          let title = "";
          if (video.flexColumns) {
            title =
              video.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer
                ?.text?.runs?.map((r) => r.text)
                .join("") || "";
          } else if (video.title) {
            title =
              video.title?.runs?.map((r) => r.text).join("") ||
              video.title?.simpleText ||
              "";
          }

          // Extract channel/artist
          let channel = "";
          if (video.flexColumns && video.flexColumns.length > 1) {
            channel =
              video.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer
                ?.text?.runs?.map((r) => r.text)
                .join("") || "";
          } else if (video.subtitle) {
            channel =
              video.subtitle?.runs?.map((r) => r.text).join("") || "";
          }

          if (title) {
            songs.push({ videoId, title, channel });
            if (songs.length >= 20) return songs;
          }
        }
      }
    }
  } catch (err) {
    console.error("Parse trending error:", err);
  }
  return songs;
}

function parseSearchResults(data) {
  const songs = [];
  try {
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const video = item?.videoRenderer;
        if (!video?.videoId) continue;

        const title =
          video.title?.runs?.map((r) => r.text).join("") ||
          video.title?.simpleText ||
          "";
        const channel =
          video.ownerText?.runs?.map((r) => r.text).join("") ||
          video.shortBylineText?.runs?.map((r) => r.text).join("") ||
          "";

        songs.push({ videoId: video.videoId, title, channel });
        if (songs.length >= 15) return songs;
      }
    }
  } catch (err) {
    console.error("Parse error:", err);
  }
  return songs;
}

// === Socket.IO: Jam Sessions ===
const sessions = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on("connection", (socket) => {
  let currentSession = null;

  socket.on("create-session", ({ name }) => {
    const code = generateCode();
    const sessionId = `jam_${code}`;
    const participant = { id: socket.id, name: name || "Host", isHost: true };
    const session = {
      sessionId,
      code,
      hostId: socket.id,
      participants: [participant],
      playlist: [],
      currentIndex: -1,
      isPlaying: false,
      currentTime: 0,
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

  socket.on("join-session", ({ code, name }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit("error", { message: "Sesion no encontrada" });
      return;
    }
    const participant = {
      id: socket.id,
      name: name || "Invitado",
      isHost: false,
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
    // Only host can control playback
    if (session.hostId !== socket.id) return;
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

  socket.on("sync-playback", ({ currentTime, isPlaying }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;
    if (session.hostId !== socket.id) return;
    session.currentTime = currentTime;
    session.isPlaying = isPlaying;
    session.lastUpdated = Date.now();
    socket.to(session.sessionId).emit("playback-synced", { currentTime, isPlaying });
  });

  socket.on("leave-session", () => {
    handleLeaveImmediate(socket, currentSession);
    currentSession = null;
  });

  socket.on("disconnect", () => {
    handleDisconnectGraceful(socket, currentSession);
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
    });
    io.to(session.sessionId).emit("participant-joined", {
      participants: session.participants.filter((p) => !p.disconnectedAt),
    });
  });
});

// Immediate leave (explicit leave-session)
function handleLeaveImmediate(socket, code) {
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
function handleDisconnectGraceful(socket, code) {
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
}

// Serve Angular build (for tunnel/production mode)
const distPath = path.join(__dirname, "..", "dist", "vinyl-player", "browser");
app.use(express.static(distPath));
app.use((req, res, next) => {
  // Don't catch API or socket.io routes
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
    return next();
  }
  res.sendFile(path.join(distPath, "index.html"));
});

server.listen(PORT, () => {
  console.log(`YouTube proxy + Jam server running on http://localhost:${PORT}`);
});
