# Despliegue en el VPS (ivento.tech)

Todo corre en Docker con un solo comando. Solo Caddy queda expuesto a internet: sirve el frontend, hace de proxy hacia la API y el tiempo real, y obtiene y renueva solo el certificado HTTPS.

```text
Internet ──443/80──▶ web (Caddy)
                      ├─ /            → frontend Angular
                      ├─ /api/*       → api:3000 (NestJS + Swagger en /api/docs)
                      └─ /socket.io/* → api:3000 (tiempo real)
                     api ──▶ db (PostgreSQL 17 + PostGIS)   sin puerto público
                     api ──▶ minio (CSV pesados)            sin puerto público
```

## 0. Requisitos (una sola vez)

- **DNS:** un registro **A** de `ivento.tech` apuntando a la IP del VPS (en el panel del dominio). Compruébalo con `dig +short ivento.tech`.
- **Puertos 80 y 443 libres** en el VPS. Si ya hay otro nginx, Apache o Traefik usándolos, hay que detenerlo o integrar Tunari Guard en ese proxy (ver el final).
- **Firewall:** abiertos solo 22, 80 y 443:
  ```bash
  sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
  ```
- **Docker con el plugin compose** (`docker compose version`) y **al menos 2 GB de RAM** libres para compilar Angular (o 1 GB de swap extra).

## 1. Primer despliegue

```bash
git clone https://github.com/4drianC4/TunariGuard.git
cd TunariGuard
cp .env.production.example .env.production
nano .env.production          # cambiar contraseñas (openssl rand -hex 24) y, si hay, la clave de OpenAI
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

La primera vez tarda varios minutos, porque compila el backend y el frontend. Para ver el estado:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api web
```

Abre https://ivento.tech. El certificado aparece en uno o dos minutos; si no, revisa el DNS y los logs de `web`.

> Para no repetir los parámetros, crea un alias en el VPS:
> `alias dc='docker compose --env-file .env.production -f docker-compose.prod.yml'`
> A partir de aquí los comandos usan `dc`.

## 2. Cargar los datos (solo la primera vez)

Todo se ejecuta **dentro del contenedor de la API**; no hace falta instalar Node ni psql en el VPS.

```bash
dc exec api node scripts/fuego.mjs setup                  # análisis del equipo (esquema fuego), ~1-2 min
dc restart api                                            # al arrancar copia los 15 distritos del paquete
dc exec api node scripts/cargar-datos.mjs historico       # 11.932 detecciones reales (+ ~3.200 alertas)
dc exec api node scripts/cargar-datos.mjs demo            # proyección simulada + alertas de la defensa
```

Comprueba con `curl https://ivento.tech/api/v1/health` que `database` y `storage` estén en `up`.

## 3. Actualizar después de un `git push`

```bash
cd TunariGuard
git pull
dc up -d --build
```

Las migraciones de la base se aplican solas al arrancar la API. Los datos se conservan en volúmenes de Docker (`pgdata`, `miniodata`).

Si llegaron datos nuevos al repo, vuelve a correr el `cargar-datos.mjs` que corresponda: no duplica nada.

## 4. Tareas habituales

| Tarea | Comando |
| --- | --- |
| Ver logs | `dc logs -f api` (o `web`, `db`) |
| Reiniciar la API | `dc restart api` |
| Reemplazar simulados por reales | `dc exec api node scripts/cargar-datos.mjs reemplazar 2026-11-15 --aplicar` |
| Copia de seguridad de la base | `dc exec db pg_dump -U tunari tunari_guard \| gzip > respaldo-$(date +%F).sql.gz` |
| Detener todo | `dc down` (los datos se conservan; `dc down -v` los **borra**) |

## 5. Claude Code en el VPS (como guía)

```bash
curl -fsSL https://claude.ai/install.sh | bash
cd ~/TunariGuard && claude
```

Al iniciar sesión muestra un enlace: ábrelo en el navegador de tu computadora. Recomendaciones:
- **Usuario:** úsalo con un usuario normal del grupo `docker` (`sudo usermod -aG docker $USER`), no como root.
- **Permisos:** déjalo en el modo que pide permiso antes de cada comando: es producción.
- **Código:** no programes en el VPS. Los cambios se hacen en local, se suben a GitHub y aquí solo se hace `git pull`.

## Si el VPS ya tiene otro proxy en 80/443

Quita el bloque `ports` del servicio `web` en `docker-compose.prod.yml` y apunta tu proxy actual a ese contenedor. Ejemplo para nginx, publicando `web` en un puerto local con `ports: ['127.0.0.1:8080:80']` y `SITE_ADDRESS=:80` en `.env.production` (deja `DOMAIN=ivento.tech`):

```nginx
server {
  server_name ivento.tech;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;     # necesario para el tiempo real
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
