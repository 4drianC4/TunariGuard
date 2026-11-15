# TunariGuard ES/EN

## Español

El selector de la barra superior aplica el idioma en la misma página y guarda la preferencia en `tunari-guard.language`. Las fechas operativas conservan la zona `America/La_Paz`.

- Los catálogos de Angular están en `Client/tunari-guard/src/app/core/i18n/es.json` y `en.json`. Conserva los parámetros entre llaves al añadir una frase.
- Las peticiones de la aplicación envían `Accept-Language`. La API negocia español e inglés y devuelve `Content-Language` y `Vary: Accept-Language`. El valor predeterminado de la API es español. El catálogo del servidor está en `Server/src/shared/i18n/en.json`, con las frases originales en español como claves.
- Las alertas exponen códigos estables. Los filtros y las actualizaciones también aceptan las etiquetas españolas históricas. Socket.IO incluye el nombre de área y el mensaje en ambos idiomas para que las notificaciones ya recibidas se adapten al selector.
- Tuni atiende consultas directas en los dos idiomas con el mismo acceso a los datos. Las transcripciones usan el idioma elegido. Cada turno ya guardado y los extractos literales conservan su idioma de origen.
- Metodología enlaza el PDF en el idioma activo. Los reportes generados traducen contexto, columnas y títulos. Las claves de la API y las propiedades de intercambio de GeoJSON mantienen el contrato técnico.
- Los scripts de operación admiten `TUNARI_LANGUAGE=en` o `TUNARI_LANGUAGE=es`. Los nombres de comandos, flags, rutas y encabezados CSV conservan su significado técnico.

PostGIS conserva mediciones, coordenadas, fechas, identificadores y registros originales. La API localiza los avisos y las descripciones conocidas al leerlos. La rama incluye la tabla `localized_contents` para contenido editorial adicional.

## English

The language control in the top bar applies the selection in place and stores it as `tunari-guard.language`. Operational timestamps retain the `America/La_Paz` time zone.

- Angular catalogs are `Client/tunari-guard/src/app/core/i18n/es.json` and `en.json`. Preserve the parameters in braces when adding copy.
- Application requests send `Accept-Language`. The API negotiates Spanish and English and returns `Content-Language` and `Vary: Accept-Language`. Its default is Spanish. The server catalog is `Server/src/shared/i18n/en.json`, keyed by the Spanish source phrases.
- Alerts expose stable codes. Filters and updates also accept the legacy Spanish labels. Socket.IO includes the area label and message in both languages so existing notifications follow the language selector.
- Tuni handles direct questions in both languages with the same access to data. Transcription uses the selected language. Existing chat turns and verbatim excerpts retain their original language.
- Methodology links to PDFs in the selected language. Generated reports localize metadata, columns, and headings. API keys and exchanged GeoJSON properties keep their wire contracts.
- Operational scripts support `TUNARI_LANGUAGE=en` and `TUNARI_LANGUAGE=es`. Commands, flags, routes, and CSV headers keep their technical meanings.

PostGIS retains the measurements, coordinates, dates, identifiers, and original records. The API localizes known descriptions and scientific notices when reading them. The branch includes the `localized_contents` table for additional editorial content.

## Verificación / Verification

Con la API local en ejecución / With the local API running:

```powershell
curl.exe -H "Accept-Language: en" http://localhost:3000/api/v1/areas/parque-tunari
curl.exe -H "Accept-Language: es" http://localhost:3000/api/v1/areas/parque-tunari
```

Ejecuta `npm test` en `Server` y `npm test -- --watch=false` en `Client/tunari-guard`.

Run `npm test` in `Server` and `npm test -- --watch=false` in `Client/tunari-guard`.
