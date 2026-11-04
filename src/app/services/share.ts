// Enlaces para compartir canciones y salas (funciones puras, ver share.spec.ts).

import { Song } from '../models/song.model';

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export interface ShareContent {
  /** Texto que acompaña al enlace (WhatsApp lo muestra antes de la vista previa). */
  text: string;
  url: string;
}

/** Enlace a la app que abre directamente esta canción. */
export function songLink(origin: string, videoId: string): string {
  return `${origin}/?song=${encodeURIComponent(videoId)}`;
}

/** Enlace que abre el diálogo para unirse a la sala. */
export function roomLink(origin: string, code: string): string {
  return `${origin}/?jam=${encodeURIComponent(code.toUpperCase())}`;
}

export function songShare(origin: string, song: Song): ShareContent {
  const who = song.channel ? ` de ${song.channel}` : '';
  return {
    text: `🎵 Escucha «${song.title}»${who} conmigo en Vinyl`,
    url: songLink(origin, song.videoId),
  };
}

export function roomShare(origin: string, code: string, songTitle?: string): ShareContent {
  const now = songTitle ? ` Ahora suena «${songTitle}».` : '';
  return {
    text: `🎧 Únete a mi sala en Vinyl (código ${code.toUpperCase()}): chateamos y armamos la música entre todos.${now}`,
    url: roomLink(origin, code),
  };
}

/** wa.me abre WhatsApp (app en el celular, WhatsApp Web en el computador) con el mensaje escrito. */
export function whatsappUrl({ text, url }: ShareContent): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

/** Lee ?song= de la URL actual; devuelve el id solo si es válido. */
export function songIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('song');
  return id && VIDEO_ID.test(id) ? id : null;
}
