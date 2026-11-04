// Cómo se presentan los mensajes del chat, como funciones puras (ver chat-view.spec.ts).

import { ChatMessage, Reaction } from '../models/chat.model';

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

export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} está escribiendo…`;
  if (names.length === 2) return `${names[0]} y ${names[1]} están escribiendo…`;
  return 'Varias personas están escribiendo…';
}
