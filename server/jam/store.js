"use strict";

// Persistencia de salas en un archivo JSON (opcional).
// Sin DATA_DIR las salas viven solo en memoria. En Railway, monta un volumen y
// define DATA_DIR=/data para que sobrevivan a reinicios y despliegues.

const fs = require("fs");
const path = require("path");

/** Campos de una sala que vale la pena guardar (sin sockets ni temporizadores). */
function serializeRoom(room) {
  return {
    code: room.code,
    name: room.name,
    hostKey: room.hostKey,
    playlist: room.playlist,
    currentIndex: room.currentIndex,
    messages: room.messages,
    createdAt: room.createdAt,
    lastActiveAt: room.lastActiveAt,
  };
}

/**
 * @param {{ file?: string|null, debounceMs?: number, logger?: Pick<Console, "error"|"log"> }} [opts]
 */
function createRoomStore({ file = null, debounceMs = 1000, logger = console } = {}) {
  let timer = null;

  return {
    /** @returns {object[]} salas guardadas (vacío si no hay archivo o está dañado). */
    load() {
      if (!file || !fs.existsSync(file)) return [];
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(data.rooms) ? data.rooms : [];
      } catch (err) {
        logger.error("[rooms] no pude leer", file, err.message);
        return [];
      }
    },

    /** Guarda todas las salas, agrupando cambios seguidos en una sola escritura. */
    scheduleSave(getRooms) {
      if (!file) return;
      clearTimeout(timer);
      timer = setTimeout(() => this.saveNow(getRooms()), debounceMs);
      timer.unref?.();
    },

    saveNow(rooms) {
      if (!file) return;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ rooms: rooms.map(serializeRoom) }));
        fs.renameSync(tmp, file); // escritura atómica: nunca queda un archivo a medias
      } catch (err) {
        logger.error("[rooms] no pude guardar", file, err.message);
      }
    },
  };
}

module.exports = { createRoomStore, serializeRoom };
