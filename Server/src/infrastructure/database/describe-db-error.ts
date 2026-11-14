/**
 * Traduce los errores de conexión más comunes a un mensaje accionable. El caso típico en
 * Windows: un PostgreSQL instalado en el equipo ocupa el puerto y rechaza al usuario tunari.
 */
export function describeDbError(error: unknown, connectionString: string): string {
  const code = findCode(error);
  const target = safeTarget(connectionString);
  switch (code) {
    case '28P01':
    case '28000':
      return (
        `${target} rechazó el usuario o la contraseña. Si es la primera vez, probablemente responde ` +
        'otro PostgreSQL (p. ej. uno instalado en Windows en 5432): usa DB_PORT=5433 y el mismo puerto ' +
        'en DATABASE_URL. Si cambiaste POSTGRES_PASSWORD después de crear el volumen: docker compose down -v. ' +
        'Detalle: npm run db:doctor'
      );
    case '3D000':
      return `La base de datos no existe en ${target}; quizá es otro servidor PostgreSQL. Ejecuta npm run db:doctor`;
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
      return `Nada responde en ${target}. ¿Docker está abierto? Ejecuta npm run db:up`;
    default:
      return `No se pudo conectar a ${target}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function findCode(error: unknown): string | undefined {
  // Prisma y el driver anidan el error original en `cause`.
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const { code, cause, originalCode } = current as { code?: unknown; cause?: unknown; originalCode?: unknown };
    if (typeof originalCode === 'string') return originalCode;
    if (typeof code === 'string' && !code.startsWith('P')) return code;
    const message = current instanceof Error ? current.message : '';
    if (/password authentication failed/i.test(message)) return '28P01';
    if (/ECONNREFUSED/.test(message)) return 'ECONNREFUSED';
    current = cause;
  }
  return undefined;
}

function safeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || 5432} (usuario ${decodeURIComponent(url.username)})`;
  } catch {
    return 'DATABASE_URL';
  }
}
