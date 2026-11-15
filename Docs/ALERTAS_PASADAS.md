# Alertas pasadas

Las alertas se crean solas cuando entra un lote o llega una detección simulada. El histórico real (2012-02 a 2026-10) ya estaba cargado, así que no tenía alertas y la pantalla salía vacía con fechas pasadas.

`POST /api/v1/alertas/regenerar` crea esas alertas de una sola vez, con las mismas reglas de la importación. Quedan como alertas reales (modo `live`, origen `REAL`), con una nota que dice que son reconstrucción histórica.

```
POST /api/v1/alertas/regenerar
{ "desde": "2012-02-01", "hasta": "2026-10-31", "aplicar": true }
```

- `desde` y `hasta`: días en hora de Bolivia.
- `aplicar`: `true` crea las alertas. Si se omite o es `false`, solo cuenta cuántas crearía, sin guardar nada (opcional, sirve para ver antes de crear).
- Se puede repetir sin problema: no duplica.
- No avisa por Socket.IO.

Con la base actual da unas 3.022 alertas en pocos segundos.
