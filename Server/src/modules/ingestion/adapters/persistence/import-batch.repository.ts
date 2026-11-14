import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { DataOrigin, RowError } from '../../domain/normalized-observation.js';

export interface NewBatch {
  source: 'CSV' | 'FIRMS_API';
  fileName: string | null;
  dataset: string;
  origin: DataOrigin;
}

export interface BatchTotals {
  checksum: string;
  rowsTotal: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  errors: RowError[];
}

@Injectable()
export class ImportBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** El lote se crea al empezar para que las observaciones lo referencien desde el primer bloque. */
  create(batch: NewBatch) {
    return this.prisma.importBatch.create({
      data: { ...batch, checksum: '', rowsTotal: 0, inserted: 0, duplicates: 0, rejected: 0 },
    });
  }

  complete(id: string, totals: BatchTotals) {
    return this.prisma.importBatch.update({
      where: { id },
      data: { ...totals, errors: totals.errors.map(({ line, message }) => ({ line, message })) },
    });
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
