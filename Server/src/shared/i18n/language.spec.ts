import { describe, expect, it } from 'vitest';
import { resolveLanguage, t, withLanguage } from './language.js';
import { listAlertsSchema, updateAlertSchema } from '../../modules/alerts/alerts.schemas.js';

describe('request language', () => {
  it('honors supported language weights and defaults to Spanish', () => {
    expect(resolveLanguage('fr, es-BO;q=0.4, en-US;q=0.9')).toBe('en');
    expect(resolveLanguage('en;q=0, es')).toBe('es');
    expect(resolveLanguage('english, fr')).toBe('es');
  });

  it('keeps concurrent languages isolated', async () => {
    const [english, spanish] = await Promise.all(['en', 'es'].map((language) =>
      withLanguage(language === 'en' ? 'en' : 'es', async () => {
        await Promise.resolve();
        return t('Pendiente');
      }),
    ));
    expect([english, spanish]).toEqual(['Pending', 'Pendiente']);
  });

  it('keeps alert operations compatible with both stable codes and legacy labels', () => {
    expect(listAlertsSchema.parse({ severidad: 'CRITICAL' }).severidad).toBe('CRITICAL');
    expect(listAlertsSchema.parse({ severidad: 'Crítica' }).severidad).toBe('CRITICAL');
    expect(updateAlertSchema.parse({ status: 'VERIFIED' }).status).toBe('VERIFIED');
    expect(updateAlertSchema.parse({ status: 'Verificada' }).status).toBe('VERIFIED');
  });
});
