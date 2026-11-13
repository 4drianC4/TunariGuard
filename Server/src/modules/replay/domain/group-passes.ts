export interface Pass<T> {
  /** Instante de la primera detección del grupo (UTC). */
  simulatedTimeUtc: string;
  features: T[];
}

interface Timed {
  properties: { acquiredAtUtc: string };
}

/**
 * Agrupa detecciones ordenadas cronológicamente en "pasadas": un grupo se cierra cuando la
 * siguiente detección está a más de `windowMinutes` de la primera del grupo. Cada pasada se
 * reproduce como un mensaje, imitando cómo llegan los datos de un paso de satélite.
 */
export function groupIntoPasses<T extends Timed>(features: T[], windowMinutes: number): Pass<T>[] {
  const windowMs = windowMinutes * 60_000;
  const passes: Pass<T>[] = [];
  let current: Pass<T> | null = null;
  let currentStart = 0;

  for (const feature of features) {
    const time = Date.parse(feature.properties.acquiredAtUtc);
    if (!current || time - currentStart > windowMs) {
      current = { simulatedTimeUtc: feature.properties.acquiredAtUtc, features: [] };
      currentStart = time;
      passes.push(current);
    }
    current.features.push(feature);
  }
  return passes;
}
