export interface Song {
  videoId: string;
  title: string;
  channel: string;
  /** Duración legible ("3:21"), cuando YouTube la entrega. */
  duration?: string;
  /** Cómo llegó a la cola: elegida por alguien o agregada por la radio automática. */
  source?: 'user' | 'radio';
  /** En una sala: quién la pidió, cuándo, y quiénes votaron por ella. */
  addedBy?: string;
  addedAt?: number;
  votes?: string[];
  /** Ids de versiones bloqueadas que esta reemplazó (para encontrarla desde el chat). */
  replacedFrom?: string[];
}
