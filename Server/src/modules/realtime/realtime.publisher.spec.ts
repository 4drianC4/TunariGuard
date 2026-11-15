import type { ObservationsService } from '../observations/observations.service.js';
import { ServerEvents } from './realtime.contract.js';
import type { RealtimeGateway } from './realtime.gateway.js';
import { RealtimePublisher } from './realtime.publisher.js';

describe('RealtimePublisher.onAlertsCreated', () => {
  it('publica las alertas de todas las áreas, incluso si el evento general se trunca', () => {
    const emitToAll = vi.fn();
    const gateway = { emitToAll } as unknown as RealtimeGateway;
    const publisher = new RealtimePublisher(gateway, {} as ObservationsService);
    const districtAlerts = Array.from({ length: 101 }, (_, index) => ({
      id: `AL-${index + 1}`,
      areaId: 'distrito-09',
    }));
    const parkAlert = { id: 'AL-102', areaId: 'parque-tunari' };

    const alerts = [parkAlert, ...districtAlerts];
    publisher.onAlertsCreated({ alerts });

    expect(emitToAll).toHaveBeenCalledWith(
      ServerEvents.AlertNew,
      expect.objectContaining({ count: 102, truncated: true, alerts: expect.not.arrayContaining([parkAlert]) }),
    );
    const notificationMessages = emitToAll.mock.calls
      .filter(([event]) => event === ServerEvents.AlertNotifications)
      .map(([, payload]) => payload.alerts);
    expect(notificationMessages.map((batch) => batch.length)).toEqual([2, 100]);
    expect(notificationMessages.reverse().flat()).toEqual([...alerts].reverse());
  });
});
