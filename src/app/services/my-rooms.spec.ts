import { describe, expect, it } from 'vitest';
import { cleanRoomName, forgetRoom, rememberRoom, MyRoom } from './my-rooms';

const room = (code: string): MyRoom => ({ code, name: 'Sala ' + code, hostKey: 'k' + code, createdAt: 0 });

describe('Mis salas', () => {
  it('no tiene límite y deja la más reciente primero, sin duplicados', () => {
    let rooms: MyRoom[] = [];
    for (const code of ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'EEEEEE']) rooms = rememberRoom(rooms, room(code));
    expect(rooms.map(r => r.code)).toEqual(['EEEEEE', 'DDDDDD', 'CCCCCC', 'BBBBBB', 'AAAAAA']);
    rooms = rememberRoom(rooms, { ...room('BBBBBB'), name: 'Renombrada' });
    expect(rooms.map(r => r.code)).toEqual(['BBBBBB', 'EEEEEE', 'DDDDDD', 'CCCCCC', 'AAAAAA']);
    expect(rooms[0].name).toBe('Renombrada');
  });

  it('olvida una sala', () => {
    expect(forgetRoom([room('AAAAAA'), room('BBBBBB')], 'AAAAAA').map(r => r.code)).toEqual(['BBBBBB']);
  });

  it('limpia el nombre de la sala', () => {
    expect(cleanRoomName('  Gym   ·  mañana  ')).toBe('Gym · mañana');
    expect(cleanRoomName('x'.repeat(60))).toHaveLength(40);
  });
});
