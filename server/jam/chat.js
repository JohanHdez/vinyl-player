"use strict";

// Chat de las salas: validación, historial, reacciones y límite de mensajes.
// Funciones puras (sin sockets) para poder probarlas: ver chat.test.js.

const { isVideoId } = require("../youtube/parsers");

const MAX_TEXT = 500;
const MAX_NAME = 30;
const HISTORY_SIZE = 100;
const REACTIONS = ["🔥", "❤️", "😂", "👏", "🎵"];

/** @typedef {{ videoId: string, title: string, channel: string, duration?: string }} Song */
/**
 * @typedef {{
 *   id: string, type: "text"|"song"|"system", authorId: string|null, author: string,
 *   text: string, song?: Song, ts: number, reactions: Record<string, string[]>
 * }} ChatMessage
 */

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Normaliza espacios y recorta; null si queda vacío. */
function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, max) : null;
}

function cleanName(value, fallback = "Invitado") {
  return cleanText(typeof value === "string" ? value.replace(/\s+/g, " ") : "", MAX_NAME) || fallback;
}

/** Solo acepta canciones con un id de YouTube válido; recorta los textos. */
function cleanSong(song) {
  if (!song || !isVideoId(song.videoId)) return null;
  const title = cleanText(song.title, 200);
  if (!title) return null;
  return {
    videoId: song.videoId,
    title,
    channel: cleanText(song.channel, 120) || "",
    ...(typeof song.duration === "string" ? { duration: song.duration.slice(0, 10) } : {}),
  };
}

/** @returns {ChatMessage} */
function createMessage({ type, author, authorId = null, text = "", song, now = Date.now() }) {
  return { id: nextId(), type, authorId, author, text, ...(song ? { song } : {}), ts: now, reactions: {} };
}

/** Agrega al historial conservando solo los últimos HISTORY_SIZE. */
function appendMessage(history, message) {
  history.push(message);
  if (history.length > HISTORY_SIZE) history.splice(0, history.length - HISTORY_SIZE);
  return message;
}

/**
 * Pone o quita la reacción `emoji` de `userId` en el mensaje (como en Messenger).
 * @returns {ChatMessage|null} el mensaje actualizado, o null si no aplica.
 */
function toggleReaction(history, messageId, emoji, userId) {
  if (!REACTIONS.includes(emoji)) return null;
  const message = history.find((m) => m.id === messageId);
  if (!message || message.type === "system") return null;
  const users = message.reactions[emoji] ?? [];
  const next = users.includes(userId) ? users.filter((u) => u !== userId) : [...users, userId];
  if (next.length) message.reactions[emoji] = next;
  else delete message.reactions[emoji];
  return message;
}

/** Límite de mensajes por ventana de tiempo (por persona). */
class RateLimiter {
  constructor({ limit, windowMs, now = Date.now }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    /** @type {Map<string, number[]>} */
    this.hits = new Map();
  }

  allow(key) {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  forget(key) {
    this.hits.delete(key);
  }
}

module.exports = {
  MAX_TEXT,
  HISTORY_SIZE,
  REACTIONS,
  cleanText,
  cleanName,
  cleanSong,
  createMessage,
  appendMessage,
  toggleReaction,
  RateLimiter,
};
