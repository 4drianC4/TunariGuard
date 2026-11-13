import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { DataOrigin, RowError } from '../../domain/normalized-observation.js';

export interface NewBatch {
  source: 'CSV' | 'FIRMS_API';
  fileName: string | null;
  checksum: string;
  dataset: string;
  origin: DataOrigin;
  rowsTotal: number;
  rejected: number;
  errors: RowError[];
}

@Injectable()
export class ImportBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(batch: NewBatch) {
    return this.prisma.importBatch.create({
      data: {
        ...batch,
        errors: batch.errors.map(({ line, message }) => ({ line, message })),
        inserted: 0,
        duplicates: 0,
      },
    });
  }

  complete(id: string, { inserted, duplicates }: { inserted: number; duplicates: number }) {
    return this.prisma.importBatch.update({ where: { id }, data: { inserted, duplicates } });
  }

  delete(id: string) {
    return this.prisma.importBatch.delete({ where: { id } });
  }

  list(limit: number) {
    return this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      omit: { errors: true },
    });
  }

  findById(id: string) {
    return this.prisma.importBatch.findUnique({ where: { id } });
  }
}
