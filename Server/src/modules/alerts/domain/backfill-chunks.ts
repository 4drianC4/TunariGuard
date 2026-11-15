export interface TimedId {
  id: string;
  acquiredAt: Date;
}

/**
 * Parte una lista cronológica de observaciones en bloques de unos `maxSize` elementos SIN cortar una pasada:
 * solo se corta donde hay un hueco de más de `gapMinutes` entre dos detecciones consecutivas, así ninguna
 * alerta queda dividida entre dos bloques. Un bloque puede pasarse de `maxSize` hasta el siguiente hueco.
 */
export function chunkAtGaps(rows: readonly TimedId[], maxSize: number, gapMinutes: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let last: number | null = null;
  for (const row of rows) {
    const t = row.acquiredAt.getTime();
    if (current.length >= maxSize && last !== null && t - last > gapMinutes * 60_000) {
      chunks.push(current);
      current = [];
    }
    current.push(row.id);
    last = t;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
