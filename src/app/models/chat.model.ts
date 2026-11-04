import { Song } from './song.model';

/** Emojis permitidos para reaccionar (deben coincidir con server/jam/chat.js). */
export const REACTIONS = ['🔥', '❤️', '😂', '👏', '🎵'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface ChatMessage {
  id: string;
  type: 'text' | 'song' | 'system';
  /** Socket id de quien escribió; null en mensajes del sistema. */
  authorId: string | null;
  author: string;
  text: string;
  song?: Song;
  ts: number;
  /** emoji → ids de quienes reaccionaron */
  reactions: Partial<Record<Reaction, string[]>>;
}
