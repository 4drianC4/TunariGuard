import { ROOM_ALL, districtRoom } from '../realtime.contract.js';

interface WithDistrict {
  properties: { district: { code: string } | null };
}

/**
 * Reparte features por sala: la sala general recibe todas; cada sala de distrito, solo las
 * suyas. Las observaciones sin distrito (fuera, ambiguas o pendientes) van solo a la general.
 */
export function fanOutByDistrict<T extends WithDistrict>(features: T[]): Map<string, T[]> {
  const rooms = new Map<string, T[]>();
  if (features.length === 0) return rooms;
  rooms.set(ROOM_ALL, features);
  for (const feature of features) {
    const code = feature.properties.district?.code;
    if (!code) continue;
    const room = districtRoom(code);
    const list = rooms.get(room);
    if (list) list.push(feature);
    else rooms.set(room, [feature]);
  }
  return rooms;
}

/** Divide en bloques para no enviar mensajes enormes por el socket. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
