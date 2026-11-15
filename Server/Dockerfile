# API de Tunari Guard (NestJS + Prisma). Imagen para producción.
# Debian trixie trae psql 17, igual que el servidor PostGIS: lo usa scripts/fuego.mjs para cargar
# el paquete de datos del equipo desde dentro del contenedor.
FROM node:24-trixie-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall ejecuta prisma generate (necesita el esquema copiado arriba).
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
# node_modules completo: la CLI de Prisma (migraciones) y los scripts de datos lo necesitan.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY data ./data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica las migraciones pendientes y arranca. Si no hay migraciones nuevas, no hace nada.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
