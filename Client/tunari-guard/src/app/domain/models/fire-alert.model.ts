import { AlertStatus } from '../enums/alert-status.enum';
import { Severity } from '../enums/severity.enum';

export interface FireAlert {
  readonly id: string;
  readonly hotspotId: string;
  readonly severity: Severity;
  readonly status: AlertStatus;
  readonly createdAtUtc: string;
  readonly message: string;
}