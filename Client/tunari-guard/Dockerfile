# Frontend de Tunari Guard: compila Angular y lo sirve con Caddy, que además hace de proxy hacia
# la API (HTTPS automático con Let's Encrypt). Ver deploy/Caddyfile.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM caddy:2.10-alpine
COPY --from=build /app/dist/tunari-guard/browser /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
