// "Mis salas": las salas que esta persona creó en este dispositivo
// (funciones puras, ver my-rooms.spec.ts).

export interface MyRoom {
  code: string;
  name: string;
  /** Llave secreta para volver como anfitrión. Solo vive en este dispositivo. */
  hostKey: string;
  /** Llave de co-anfitrión, si el anfitrión le dio ese rol en esta sala. */
  cohostKey?: string;
  createdAt: number;
}

export interface RoomStatus {
  code: string;
  exists: boolean;
  name?: string;
  people?: number;
  hostOnline?: boolean;
}

/** Agrega o actualiza una sala, dejando las más recientes primero. */
export function rememberRoom(rooms: MyRoom[], room: MyRoom): MyRoom[] {
  return [room, ...rooms.filter(r => r.code !== room.code)];
}

export function forgetRoom(rooms: MyRoom[], code: string): MyRoom[] {
  return rooms.filter(r => r.code !== code);
}

/** Ideas de nombre para crear una sala rápido. */
export const ROOM_NAME_IDEAS = ['Gym · mañana', 'Fiesta del viernes', 'Oficina', 'Asado', 'Viaje en carro', 'Estudio'];

/** Nombre de sala limpio: sin espacios de más y máximo 40 caracteres. */
export function cleanRoomName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 40);
}
