# Datos de demostración

`SIMULADO_firms_viirs_2027.csv`: 1.109 detecciones VIIRS **inventadas** de 2027, en formato NASA FIRMS. Las preparó el equipo de datos para mostrar el tiempo real en la demo. **No son datos reales:** se importan siempre con `origin=SIMULATED` y la interfaz las marca como simuladas.

```bash
npm run datos:demo     # con el servidor corriendo; imprime el comando de replay (sin batchId: 2027 solo tiene datos simulados)
```

Tramos con episodios para la reproducción histórica:

| Tramo | Qué se ve |
| --- | --- |
| 12–16 de agosto de 2027 | 33 pasadas con 186 detecciones |
| 20–23 de septiembre de 2027 | Otro episodio |
| 17–20 de febrero de 2027 | Otro episodio |

SHA-256: `11efbcdd9d2a86bef84b8733a9bd3146f3423f1c930f9cfe9c0663369e2e3a4d`.

Los datos de 2027 no se solapan con ningún dato real, así que importarlos no reemplaza NRT.
