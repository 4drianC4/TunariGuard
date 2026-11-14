import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// La CLI de Prisma no carga .env por sí sola; en CI/producción las variables ya vienen del entorno.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
