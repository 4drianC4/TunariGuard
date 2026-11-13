import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Valida con un esquema Zod sin registrarlo en los metadatos de Swagger.
 * Se usa en formularios multipart: @nestjs/swagger 12 prioriza un esquema de @Body({ schema })
 * sobre @ApiBody, y eso ocultaría el campo del archivo en la documentación.
 */
export class SchemaPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException(
      result.error.issues.map((issue) =>
        issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      ),
    );
  }
}
