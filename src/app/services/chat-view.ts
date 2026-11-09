// Cómo se presentan los mensajes del chat, como funciones puras (ver chat-view.spec.ts).

import { ChatMessage, Reaction } from '../models/chat.model';
import { Song } from '../models/song.model';
import type { TKey } from '../i18n/dict';
import type { Params } from '../i18n/part';

/** Función que traduce una clave (I18nService.t o translate con un idioma fijo). */
export type Translate = (key: TKey, params?: Params) => string;

/** Mensajes seguidos del mismo autor dentro de esta ventana se agrupan (sin repetir nombre ni avatar). */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface ViewMessage extends ChatMessage {
  mine: boolean;
  firstOfGroup: boolean;
  reactionList: { emoji: Reaction; count: number; mine: boolean }[];
}

export function toViewMessages(list: ChatMessage[], myId: string): ViewMessage[] {
  return list.map((m, i) => {
    const prev = list[i - 1];
    const sameAuthor =
      !!prev && prev.type !== 'system' && m.type !== 'system' && prev.authorId === m.authorId && m.ts - prev.ts < GROUP_WINDOW_MS;
    return {
      ...m,
      mine: !!m.authorId && m.authorId === myId,
      firstOfGroup: !sameAuthor,
      reactionList: (Object.entries(m.reactions) as [Reaction, string[]][])
        .filter(([, users]) => users.length > 0)
        .map(([emoji, users]) => ({ emoji, count: users.length, mine: users.includes(myId) })),
    };
  });
}

export function typingLabel(names: string[], t: Translate): string {
  if (names.length === 0) return '';
  if (names.length === 1) return t('rooms.typing.one', { name: names[0] });
  if (names.length === 2) return t('rooms.typing.two', { a: names[0], b: names[1] });
  return t('rooms.typing.many');
}

/** Estado de una canción compartida en el chat respecto a la cola de la sala. */
export type CardState =
  | { kind: 'playing'; song: Song }
  | { kind: 'played'; song: Song }
  | { kind: 'upcoming'; song: Song }
  | { kind: 'missing' };

/**
 * Busca la canción del chat en la cola (también si se reemplazó por otra versión)
 * y dice si suena, ya sonó, espera turno o no está.
 */
export function cardState(shared: Pick<Song, 'videoId'>, playlist: Song[], currentIndex: number): CardState {
  const index = playlist.findIndex(s => s.videoId === shared.videoId || s.replacedFrom?.includes(shared.videoId));
  if (index < 0) return { kind: 'missing' };
  const song = playlist[index];
  if (index === currentIndex) return { kind: 'playing', song };
  if (index < currentIndex) return { kind: 'played', song };
  return { kind: 'upcoming', song };
}
