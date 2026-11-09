// Mudanza de dominio (funciones puras + una que toca localStorage; ver storage-import.spec.ts).
//
// El navegador guarda los datos por dominio. Al cambiar de dirección, el dominio
// viejo redirige al nuevo con lo guardado en el enlace (#importar=...), después
// del "#", que nunca viaja al servidor. Aquí se recibe, se guarda y se borra de la URL.
// Lo más importante que viaja: "Mis salas", con las llaves de anfitrión.

const PARAM = 'importar';
const ROOMS_KEY = 'vinyl_my_rooms';

/** Solo se aceptan las claves de esta app. */
const isAppKey = (key: string) => /^vinyl[._]/.test(key);

/** Lee el paquete del hash (#importar=<base64 de JSON>). null si no hay o está dañado. */
export function parseImport(hash: string): Record<string, string> | null {
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get(PARAM);
  if (!raw) return null;
  try {
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) if (isAppKey(k) && typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return null;
  }
}

/** Une "Mis salas": las que ya había en este dominio mandan; se agregan las que traía. */
export function mergeRooms(current: string | null, incoming: string): string {
  const parse = (v: string | null) => {
    try {
      const list = JSON.parse(v ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const here = parse(current);
  const codes = new Set(here.map((r: { code?: string }) => r?.code));
  return JSON.stringify([...here, ...parse(incoming).filter((r: { code?: string }) => r?.code && !codes.has(r.code))]);
}

/** Guarda lo que vino del dominio viejo (sin pisar lo que ya hay aquí) y limpia la URL. */
export function importFromOldDomain(loc: Location = location, storage: Storage = localStorage): void {
  const data = parseImport(loc.hash);
  if (!data) return;
  try {
    for (const [key, value] of Object.entries(data)) {
      if (key === ROOMS_KEY) storage.setItem(key, mergeRooms(storage.getItem(key), value));
      else if (storage.getItem(key) === null) storage.setItem(key, value);
    }
  } catch {
    // Sin almacenamiento (modo privado): no hay dónde guardar, se sigue sin los datos.
  }
  history.replaceState(null, '', loc.pathname + loc.search);
}
