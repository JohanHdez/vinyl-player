// Reglas del buscador (funciones puras salvo el almacenamiento; ver search-input.spec.ts).

/** Desde cuántas letras se busca solo mientras escribes. */
export const MIN_QUERY_LENGTH = 3;
const RECENT_KEY = 'vinyl.recentSearches';
const MAX_RECENT = 6;

/** ¿Vale la pena buscar ya? Desde 3 letras, o si es un enlace de YouTube. */
export function shouldSearch(value: string): boolean {
  const q = value.trim();
  return q.length >= MIN_QUERY_LENGTH || /youtu\.?be/.test(q);
}

/** Pone `term` de primero, sin repetir (sin importar mayúsculas) y con máximo `max`. */
export function withRecent(list: string[], term: string, max = MAX_RECENT): string[] {
  const t = term.trim();
  if (!t || /^https?:\/\//.test(t)) return list;
  return [t, ...list.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, max);
}

export function readRecent(): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(x => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecent(term: string): string[] {
  const next = withRecent(readRecent(), term);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento: las recientes duran solo esta visita.
  }
  return next;
}
