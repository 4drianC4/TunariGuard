import { HarmonizedHotspot } from './harmonized-hotspot.model';
export interface HarmonizationResult {
  readonly methodVersion: string;
  readonly generatedAtUtc: string;
  readonly inputObservations: number;
  readonly candidateGroups: readonly HarmonizedHotspot[];
  readonly warnings: readonly string[];
}