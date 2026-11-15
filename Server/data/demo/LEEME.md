# Proyección simulada (datos de demostración)

Entrega v3 del equipo de datos (14-nov-2026). **Todo lo de esta carpeta es inventado**: un futuro posible según un modelo, no una predicción. Una detección satelital de calor no es un incendio confirmado.

| Archivo | Qué es |
| --- | --- |
| `SIMULADO_proyeccion_2026-11-14_a_2031-12-31.csv` | 4.153 detecciones VIIRS **inventadas** (NOAA-20 y NOAA-21), del 17-nov-2026 al 27-dic-2031, en formato FIRMS |
| `ALERTAS_DEFENSA_2026-11-14_2200_a_2026-11-15_2000_cada5min.csv` | 423 detecciones VIIRS **inventadas** para la defensa: una o dos cada 5 minutos, del 14-nov 22:00 al 15-nov 20:00 (hora de Bolivia). Cada una genera su alerta al llegar su hora |
| `serie_proyeccion_mensual.csv` | Por mes: índice esperado por el modelo y detecciones generadas. Se expone en `GET /api/v1/proyeccion/mensual` |

SHA-256 (de la entrega):
- `3a5180a24471cb8d6e29f0cd5a2ff824d0760f48c7760784f21bc4b28aaad06d`: proyección
- `ac8335d32a76527df236a3a32d9de4ecb96a711c13430cf386cca5d8d1e36c2b`: serie mensual
- `ee6d37022306e8cf24231eddc243323a461d7c6e0d6080ac56377579bf9977a0`: alertas de la defensa

## Cómo se usa

```bash
npm run datos:demo     # con el servidor corriendo; se carga siempre como SIMULATED
```

- **Llega a su hora.** Cada detección simulada "llega" cuando se cumple su fecha y hora. En ese momento el backend la anuncia en el mapa (`hotspots:new`, simulada) y genera su alerta (`alert:new`). Al importar no se anuncia nada del futuro.
- **Para verla ya**, reprodúcela con `POST /api/v1/replay/start`. Tramos intensos: 6–10 jul 2027, 8–12 jul 2028 y 16–20 ago 2029.
- **Cuando llegan datos reales**, se cargan con `npm run datos:cargar` (o el CSV que corresponda) y después se reemplazan los simulados de esos días:

  ```bash
  npm run datos:reemplazar-simulados -- 2026-11-13            # ensayo: solo cuenta
  npm run datos:reemplazar-simulados -- 2026-11-13 --aplicar  # borra las simuladas hasta ese día (hora de Bolivia)
  ```

  El día es el último con datos reales **completos**; el día en curso no cuenta. Borra solo datos simulados y sus alertas, y avisa a las pantallas abiertas (`hotspots:removed` y `alert:removed`). Sustituye al `reemplazar_simulados_por_reales.sql` de la entrega, que además calculaba mal el día: tomaba la hora UTC como si fuera de Bolivia.

## Cuidados

- No cargarla junto con el `SIMULADO 2027` de la demo anterior: los dos cubren 2027 y se sumarían. Si tu base lo tiene, `npm run datos:demo` te avisa. Bórralo con `npm run datos:limpiar-simulados -- --aplicar`, que solo borra datos simulados.
- Lo simulado está en `/observations` (`source: SIMULATED`, filtro `origin=SIMULATED`) y en las alertas (`simulated: true`). No aparece en `/detecciones` ni en el resto del análisis `fuego`, que llega al 31-oct-2026.
