# TunariGuard — internacionalización ES/EN

## Contrato de idioma

- Idiomas admitidos: `es` y `en`.
- Angular conserva la preferencia en `localStorage` bajo `tunari-guard.language`.
- Cada petición HTTP envía `Accept-Language: es|en`.
- El backend usa español como fallback cuando no llega un idioma válido.
- WebSocket debe recibir el idioma elegido al conectar (query/auth handshake) y generar los textos operativos en ese idioma; los eventos deben conservar también códigos estables.

## Base de datos: qué se traduce

La migración `Server/prisma/migrations/20261115093000_add_localized_content/migration.sql`
crea `localized_contents` para textos descriptivos. Clave lógica:
`entity_type + entity_id + field_key + language`.

Ejemplos:
- `alert / UUID / message / es`
- `alert / UUID / message / en`
- `district / 3 / description / es`

`source_language` identifica el idioma que envió el proveedor. `translation_status` distingue texto original, traducción humana, automática o pendiente.

No traducir ni alterar:
- latitud/longitud, fechas UTC, FRP, brillo Kelvin, confianza numérica;
- sensor/plataforma, códigos FIRMS, IDs, claves de deduplicación;
- CSV/JSON originales ni la columna `raw` de observaciones.

Los nombres oficiales de lugares pueden conservarse como nombre propio y disponer de un campo de etiqueta traducida separado.

## Cómo comprobar el idioma que llega a la API

En DevTools → Network → seleccionar una petición → Request Headers:
- `Accept-Language: es` significa que el navegador solicita español.
- `Accept-Language: en` significa que solicita inglés.

Eso solo informa el idioma solicitado por el cliente. Para conocer el idioma del dato entrante, guardar `source_language` en cada registro de texto importado. No inferirlo de `Accept-Language`: el idioma de interfaz y el idioma del proveedor son independientes.

## Aplicar la migración

Desde PowerShell:

```powershell
cd "C:\SPACE APP\TunariGuard\Server"
npx prisma migrate deploy
```

La migración usa PostgreSQL y no requiere regenerar Prisma Client porque esta tabla se puede consultar inicialmente mediante SQL parametrizado. Si se incorpora el modelo al schema Prisma, ejecutar después `npx prisma generate`.

## Alcance de este parche

Este parche incorpora persistencia de preferencia, selector ES/EN, encabezado HTTP, resolvedor backend y tabla para textos localizados. No traduce automáticamente cada plantilla Angular ni cada registro existente. Cada vista debe reemplazar sus textos literales por claves del catálogo; cada endpoint debe seleccionar `localized_contents` usando el idioma resuelto. No ejecutar traducción automática en cada GET: traducir al ingresar/importar, almacenar ambas versiones y servir la ya existente.

## Prueba rápida del encabezado

```powershell
curl.exe -H "Accept-Language: en" http://localhost:3000/api/v1/health
curl.exe -H "Accept-Language: es" http://localhost:3000/api/v1/health
```
