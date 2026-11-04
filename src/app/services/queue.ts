// Reglas de la cola de reproducción como funciones puras (sin Angular).
// Así se pueden probar sin navegador: ver queue.spec.ts.

import { Song } from '../models/song.model';

/** Cuántas canciones por delante deben quedar antes de que la radio agregue más. */
export const RADIO_LOW_WATER = 2;
/** Cuántas canciones agrega la radio cada vez. */
export const RADIO_BATCH = 5;

export interface NextOptions {
  shuffle: boolean;
  /** Inyectable para pruebas; por defecto Math.random. */
  random?: () => number;
}

/**
 * Índice de la siguiente canción, o `null` si la cola terminó.
 * Antes la cola volvía al inicio sin avisar; ahora el final es explícito para
 * que la radio automática pueda continuar con canciones nuevas.
 */
export function nextIndex(length: number, current: number, { shuffle, random = Math.random }: NextOptions): number | null {
  if (length === 0) return null;
  if (shuffle) {
    if (length === 1) return null;
    // Cualquier canción distinta de la actual.
    const pick = Math.floor(random() * (length - 1));
    return pick >= current ? pick + 1 : pick;
  }
  return current + 1 < length ? current + 1 : null;
}

/** Índice anterior; en la primera canción se queda en ella (reinicia). */
export function prevIndex(length: number, current: number): number | null {
  if (length === 0) return null;
  return Math.max(0, current - 1);
}

/** Cuántas canciones quedan después de la actual. */
export function remainingAfter(length: number, current: number): number {
  return current < 0 ? length : Math.max(0, length - current - 1);
}

/** ¿Debe la radio agregar canciones ya, para que nunca se quede en silencio? */
export function shouldExtend(length: number, current: number, threshold = RADIO_LOW_WATER): boolean {
  return remainingAfter(length, current) < threshold;
}

/**
 * Elige canciones nuevas para la radio: en orden de relevancia, sin repetir lo
 * que ya está en la cola ni lo que ya sonó, y evitando más de dos seguidas del
 * mismo artista para que no se sienta monótono.
 */
export function pickRadioSongs(candidates: Song[], exclude: ReadonlySet<string>, count = RADIO_BATCH): Song[] {
  const picked: Song[] = [];
  const skipped: Song[] = [];
  const seen = new Set(exclude);

  for (const song of candidates) {
    if (picked.length >= count) break;
    if (seen.has(song.videoId)) continue;
    seen.add(song.videoId);

    const lastTwo = picked.slice(-2);
    const sameArtistStreak = lastTwo.length === 2 && lastTwo.every((s) => s.channel && s.channel === song.channel);
    if (sameArtistStreak) {
      skipped.push(song);
      continue;
    }
    picked.push({ ...song, source: 'radio' });
  }

  // Si no alcanzó por la regla de artistas, completa con lo que se saltó.
  for (const song of skipped) {
    if (picked.length >= count) break;
    picked.push({ ...song, source: 'radio' });
  }
  return picked;
}

/** Quita de las sugerencias lo que ya está en la cola. */
export function withoutQueued(suggestions: Song[], queue: Song[]): Song[] {
  const queued = new Set(queue.map((s) => s.videoId));
  return suggestions.filter((s) => !queued.has(s.videoId));
}
