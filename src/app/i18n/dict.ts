// Diccionario completo: une los trozos de parts/. Cada trozo usa un prefijo propio
// en sus claves (rooms.*, player.*, terms.*, srv.*...) para que no choquen.
import { common } from './parts/common';
import { player } from './parts/player';
import { rooms } from './parts/rooms';
import { terms } from './parts/terms';

export const es = { ...common.es, ...rooms.es, ...player.es, ...terms.es };
export type TKey = keyof typeof es;
export const en: Record<TKey, string> = { ...common.en, ...rooms.en, ...player.en, ...terms.en };

export type Lang = 'es' | 'en';
export const DICTS: Record<Lang, Record<TKey, string>> = { es, en };
