# Tunari Guard â€” Arquitectura

- **core/**: shell, layout, servicios globales. No lÃ³gica cientÃ­fica.
- **shared/**: UI reutilizable sin llamadas directas a API.
- **domain/enums/**: catÃ¡logos cerrados (SensorType, Severity, DataOrigin...).
- **domain/models/**: contratos tipados de observaciÃ³n, hotspot armonizado, alerta, distrito y filtros.
- **domain/ports/**: contratos para datos/algoritmos; evita dependencia de una sola API.
- **data-access/mock/**: fixtures SIMULATED, visibles como demo.
- **data-access/services/**: adaptadores futuros (NASA FIRMS / CSV).
- **application/services/**: facades, Signals, filtros, estado y lÃ³gica de casos de uso.
- **features/**: 8 pÃ¡ginas de negocio y sus componentes propios; lazy loading.

## Progreso real del scaffold

**Listo:** Angular 22, rutas, shell, navegaciÃ³n, componentes vacÃ­os, interfaces, enums, mock tipado, store Signals y dashboard con KPI de demostraciÃ³n.

**Pendiente:** implementar Leaflet real, ECharts, CSV, backend NASA, armonizaciÃ³n validada, reportes, alertas y tests cientÃ­ficos. Los componentes se generan como espacios de trabajo, NO como funcionalidades ya completadas.

## Reglas NASA / buenas prÃ¡cticas

- MODIS y VIIRS no deben fusionarse simplemente por cercanÃ­a; evaluar distancia, tiempo, geometrÃ­a/huella, resoluciÃ³n y nivel de confianza.
- Conservar observaciones originales y trazabilidad: sensor, plataforma, dataset, UTC, agrupamiento/version del mÃ©todo.
- Una detecciÃ³n tÃ©rmica no prueba que exista un incendio confirmado.
- Datos simulados siempre identificados como SIMULATED.
- NASA FIRMS MAP_KEY debe estar solo en backend o variables de entorno seguras del servidor; nunca en Git ni en Angular publico.

## Comandos utiles

```powershell
cd tunari-guard
npx ng serve --open
npx ng build
npx ng test
npx ng generate component features/map/components/example --type=component --style=scss
npx ng generate service application/services/example --type=service
```