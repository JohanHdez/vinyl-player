// Qué hacer cuando YouTube no deja reproducir un video fuera de youtube.com
// (funciones puras, ver recovery.spec.ts).
//
// Muchas subidas de terceros o con reclamos de disqueras tienen la inserción
// desactivada. Solo el navegador puede saberlo (el reproductor responde con un
// error), así que la app prueba otras versiones de la misma canción.

import { Song } from '../models/song.model';

/** Errores del IFrame API que significan "este video no se puede reproducir aquí". */
export const BLOCKED_ERRORS: ReadonlySet<number> = new Set([100, 101, 150]);
/** Cuántas versiones alternativas probar antes de rendirse. */
export const MAX_ATTEMPTS = 4;

/** Palabras que no ayudan a identificar la canción. */
const NOISE = new Set([
  'official', 'oficial', 'video', 'videoclip', 'audio', 'lyric', 'lyrics', 'letra', 'original', 'hd', 'hq', '4k',
  'remastered', 'remasterizado', 'remaster', 'version', 'ft', 'feat', 'featuring', 'con', 'with', 'y', 'and', 'the',
  'el', 'la', 'los', 'las', 'de', 'del', 'a', 'en', 'topic', 'vevo', 'music', 'musica', 'oficial',
]);

/** Palabras significativas de un texto: minúsculas, sin tildes ni signos ni ruido. */
export function keywords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE.has(w));
}

/** Texto para buscar otras versiones: el título sin el ruido de la subida. */
export function searchQueryFor(song: Song): string {
  return keywords(song.title).join(' ') || song.title;
}

/**
 * Qué tanto se parece `candidate` a `original` (0 a 1): proporción de palabras
 * del título original presentes en el título y canal del candidato.
 */
export function similarity(original: Song, candidate: Song): number {
  const wanted = new Set(keywords(original.title));
  if (wanted.size === 0) return 0;
  const have = new Set(keywords(`${candidate.title} ${candidate.channel}`));
  let hits = 0;
  for (const w of wanted) if (have.has(w)) hits++;
  return hits / wanted.size;
}

/**
 * Versiones alternativas ordenadas de la más parecida a la menos, descartando
 * las ya probadas y las que no se parecen lo suficiente (para no poner otra canción).
 */
export function rankAlternatives(original: Song, results: Song[], tried: ReadonlySet<string>, minScore = 0.6): Song[] {
  return results
    .filter(s => s.videoId !== original.videoId && !tried.has(s.videoId))
    .map(s => ({ song: s, score: similarity(original, s) }))
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(x => x.song);
}
