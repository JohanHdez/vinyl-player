"use strict";

// Orden de la cola de una sala por votos (función pura, ver queue-order.test.js).
//
// - Lo que ya sonó y lo que suena ahora no se mueve.
// - Lo que espera se ordena por: más votos primero; a igualdad, los pedidos de
//   personas antes que los de la radio automática; y luego por orden de llegada.

/** @typedef {{ videoId: string, votes?: string[], source?: string, addedAt?: number }} QueueSong */

const voteCount = (song) => (Array.isArray(song.votes) ? song.votes.length : 0);

/**
 * @param {QueueSong[]} playlist
 * @param {number} currentIndex  índice de lo que suena (-1 si nada)
 * @returns {QueueSong[]} nueva cola (no modifica la original)
 */
function orderQueue(playlist, currentIndex) {
  const fixed = playlist.slice(0, currentIndex + 1);
  const upcoming = playlist
    .slice(currentIndex + 1)
    .map((song, i) => ({ song, i }))
    .sort(
      (a, b) =>
        voteCount(b.song) - voteCount(a.song) ||
        (a.song.source === "radio") - (b.song.source === "radio") ||
        (a.song.addedAt ?? 0) - (b.song.addedAt ?? 0) ||
        a.i - b.i
    )
    .map(({ song }) => song);
  return [...fixed, ...upcoming];
}

/**
 * Pone o quita el voto de `voterId` en la canción `videoId`.
 * Solo se vota lo que todavía no suena.
 * @returns {boolean} si cambió algo
 */
function toggleVote(playlist, currentIndex, videoId, voterId) {
  const index = playlist.findIndex((s) => s.videoId === videoId);
  if (index <= currentIndex || index < 0) return false;
  const song = playlist[index];
  const votes = Array.isArray(song.votes) ? song.votes : [];
  song.votes = votes.includes(voterId) ? votes.filter((v) => v !== voterId) : [...votes, voterId];
  return true;
}

module.exports = { orderQueue, toggleVote, voteCount };
