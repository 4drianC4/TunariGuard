/** Shared selection contract for map, history, and future analytic layers. */
export type MapEntitySelection =
  | { kind: 'observation'; id: string }
  | { kind: 'recurrence-cell'; id: string }
  | { kind: 'getis-ord-cell'; id: string }
  | { kind: 'candidate-event'; id: string }
  | { kind: 'alert-area'; id: string };
