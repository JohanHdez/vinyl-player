// Reproducción en segundo plano (funciones puras, ver background-play.spec.ts).
//
// Brave deja sonar el reproductor de YouTube con la pantalla apagada; Chrome y
// otros navegadores lo pausan justo al ocultar la página. La app lo reanuda,
// pero solo si esa pausa llegó enseguida después de ocultarse: una pausa que
// llega más tarde la hizo la persona (desde la pantalla de bloqueo) y se respeta.

import { Song } from '../models/song.model';

/** Ventana después de ocultar la página en la que una pausa se considera del navegador. */
export const BROWSER_PAUSE_WINDOW_MS = 3000;

export interface PauseContext {
  /** ¿La app quiere que suene? (nadie pidió pausa) */
  wantsToPlay: boolean;
  /** ¿La página está oculta? (pantalla apagada u otra app encima) */
  hidden: boolean;
  /** Milisegundos desde que la página se ocultó. */
  msSinceHidden: number;
}

/** ¿Esta pausa la hizo el navegador al ocultar la página, y conviene reanudar? */
export function isBrowserPause({ wantsToPlay, hidden, msSinceHidden }: PauseContext): boolean {
  return wantsToPlay && hidden && msSinceHidden >= 0 && msSinceHidden <= BROWSER_PAUSE_WINDOW_MS;
}

/** Datos para la pantalla de bloqueo y la notificación de música del sistema. */
export function mediaMetadataFor(song: Song): { title: string; artist: string; album: string; artwork: { src: string; sizes: string; type: string }[] } {
  const thumb = (name: string) => `https://i.ytimg.com/vi/${song.videoId}/${name}.jpg`;
  return {
    title: song.title,
    artist: song.channel,
    album: 'Vinyl Player',
    artwork: [
      { src: thumb('mqdefault'), sizes: '320x180', type: 'image/jpeg' },
      { src: thumb('hqdefault'), sizes: '480x360', type: 'image/jpeg' },
    ],
  };
}
