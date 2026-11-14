/** Configuración para producción. El servidor web debe exponer /api/v1 o hacer proxy al backend. */
export const environment = {
  apiBaseUrl: '/api/v1',
  mapDataOrigin: 'BACKEND' as const,
};
