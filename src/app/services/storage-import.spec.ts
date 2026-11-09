import { describe, expect, it } from 'vitest';
import { mergeRooms, parseImport } from './storage-import';

/** Igual que lo arma la página de redirección del dominio viejo. */
const pack = (data: object) => {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return '#importar=' + encodeURIComponent(btoa(String.fromCharCode(...bytes)));
};

describe('parseImport', () => {
  it('lee lo que manda el dominio viejo, con tildes y emojis', () => {
    const rooms = JSON.stringify([{ code: 'K7M2QX', name: 'Gym · mañana 🎶', hostKey: 'abc' }]);
    expect(parseImport(pack({ vinyl_my_rooms: rooms, vinyl_jam_name: 'Johan' }))).toEqual({
      vinyl_my_rooms: rooms,
      vinyl_jam_name: 'Johan',
    });
  });

  it('ignora claves que no son de la app y valores que no son texto', () => {
    expect(parseImport(pack({ token: 'x', 'vinyl.autoplay': 'off', vinyl_n: 3 }))).toEqual({ 'vinyl.autoplay': 'off' });
  });

  it('devuelve null si no hay paquete o está dañado', () => {
    expect(parseImport('')).toBeNull();
    expect(parseImport('#otra=1')).toBeNull();
    expect(parseImport('#importar=%%%no-es-base64')).toBeNull();
  });
});

describe('mergeRooms', () => {
  it('agrega las salas que traía sin pisar las que ya había aquí', () => {
    const here = JSON.stringify([{ code: 'A', hostKey: 'nueva' }]);
    const old = JSON.stringify([{ code: 'A', hostKey: 'vieja' }, { code: 'B', hostKey: 'b' }]);
    expect(JSON.parse(mergeRooms(here, old))).toEqual([{ code: 'A', hostKey: 'nueva' }, { code: 'B', hostKey: 'b' }]);
  });

  it('funciona sin salas previas', () => {
    expect(JSON.parse(mergeRooms(null, JSON.stringify([{ code: 'B' }])))).toEqual([{ code: 'B' }]);
  });
});
