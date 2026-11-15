import { ALERTS_CREATED, OBSERVATIONS_ARRIVED } from '../../shared/domain-events.js';
import type { AlertsRepository } from './alerts.repository.js';
import { AlertsService } from './alerts.service.js';

function setup(llegadas: string[]) {
  const repository = {
    simulatedBetween: vi.fn().mockResolvedValue(llegadas),
    fuegoAvailable: vi.fn().mockResolvedValue(true),
    detections: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([]),
  };
  const events = { emit: vi.fn() };
  const service = new AlertsService(repository as unknown as AlertsRepository, events as never);
  return { service, repository, events };
}

describe('AlertsService.checkArrivals (proyección simulada que llega a su hora)', () => {
  it('sin llegadas no anuncia nada ni genera alertas', async () => {
    const { service, repository, events } = setup([]);
    await service.checkArrivals(new Date('2026-11-17T17:35:00Z'));
    expect(events.emit).not.toHaveBeenCalled();
    expect(repository.detections).not.toHaveBeenCalled();
  });

  it('anuncia lo que llegó y genera alertas solo con lo recién llegado', async () => {
    const { service, repository, events } = setup(['obs-1', 'obs-2']);
    const t1 = new Date('2026-11-17T17:35:00Z');
    await service.checkArrivals(t1);
    expect(events.emit).toHaveBeenCalledWith(OBSERVATIONS_ARRIVED, { observationIds: ['obs-1', 'obs-2'] });

    expect(repository.simulatedBetween).toHaveBeenCalledTimes(1);
    expect(repository.detections).toHaveBeenCalledWith({ observationIds: ['obs-1', 'obs-2'], upTo: t1 }, true);
    // Sin alertas nuevas (insertMany vacío) no se emite alert:new.
    expect(events.emit).not.toHaveBeenCalledWith(ALERTS_CREATED, expect.anything());
  });

  it('cada revisión continúa donde terminó la anterior', async () => {
    const { service, repository } = setup([]);
    const t1 = new Date('2026-11-17T17:35:00Z');
    const t2 = new Date('2026-11-17T17:36:00Z');
    await service.checkArrivals(t1);
    await service.checkArrivals(t2);
    const [, [desde2, hasta2]] = repository.simulatedBetween.mock.calls as [Date, Date][];
    expect(desde2).toBe(t1);
    expect(hasta2).toBe(t2);
  });
});
