# Tuni V7 — Instalación desde `main` limpio

Mascota forestal interactiva realizada con las capas del zorrito original. Incluye saludo sin holograma, palma abierta, susto expresivo, parpadeo, cola, radar, cuerpo y cabeza animados. Reacciones de interfaz solamente: **no son alertas de incendios reales**.

## Instalación

Desde la raíz de TunariGuard, con el archivo `.patch` descargado:

```powershell
git apply --check --binary "C:\ruta\a\TunariGuard-Tuni-V7-DESDE-CERO.patch"
git apply --binary "C:\ruta\a\TunariGuard-Tuni-V7-DESDE-CERO.patch"
cd Client\tunari-guard
npm install
npm start
```

Para revertir sin tener nuevos cambios sobre estos archivos:

```powershell
git apply -R --binary "C:\ruta\a\TunariGuard-Tuni-V7-DESDE-CERO.patch"
```

No necesitas ejecutar ningún `.ps1`. Compatible con la estructura Angular 22 existente del repositorio. No modifica `Server/` ni instala nuevas dependencias.
