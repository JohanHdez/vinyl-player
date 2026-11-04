export interface Song {
  videoId: string;
  title: string;
  channel: string;
  /** Duración legible ("3:21"), cuando YouTube la entrega. */
  duration?: string;
  /** Cómo llegó a la cola: elegida por alguien o agregada por la radio automática. */
  source?: 'user' | 'radio';
}
