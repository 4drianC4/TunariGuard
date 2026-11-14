import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

export interface StoredObject {
  key: string;
  size: number;
  lastModified: string | null;
}

export interface PresignedUpload {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * Acceso al almacenamiento de objetos (MinIO en desarrollo, cualquier S3 en producción).
 * Los archivos pesados no pasan por el backend al subirse: el cliente recibe una URL firmada
 * y sube directo a S3; el backend solo los lee por streaming al importarlos.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** Firma URLs con el host que ve el cliente (puede diferir del que usa el backend). */
  private readonly presignClient: S3Client;
  readonly bucket: string;
  private bucketReady = false;

  constructor(config: ConfigService<Env, true>) {
    const credentials = {
      accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
    };
    const region = config.get('S3_REGION', { infer: true });
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const publicEndpoint = config.get('S3_PUBLIC_ENDPOINT', { infer: true }) ?? endpoint;

    // MinIO necesita rutas tipo /bucket/clave en lugar de subdominios por bucket.
    this.client = new S3Client({ endpoint, region, credentials, forcePathStyle: true });
    this.presignClient = new S3Client({ endpoint: publicEndpoint, region, credentials, forcePathStyle: true });
    this.bucket = config.get('S3_BUCKET', { infer: true });
  }

  /** Crea el bucket si falta. Si S3 no responde, la API arranca igual y lo reintenta al usarse. */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (error) {
      this.logger.warn(
        `Almacenamiento S3 no disponible (${error instanceof Error ? error.message : String(error)}); ` +
          'las subidas fallarán hasta que MinIO esté arriba (npm run db:up).',
      );
    }
  }

  /** `force` vuelve a consultar a S3 (lo usa el health check). */
  async ensureBucket(force = false): Promise<void> {
    if (this.bucketReady && !force) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!(error instanceof NotFound) && (error as { name?: string }).name !== 'NotFound') throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket ${this.bucket} creado`);
    }
    this.bucketReady = true;
  }

  async presignUpload(objectKey: string, contentType: string, expiresInSeconds: number): Promise<PresignedUpload> {
    await this.ensureBucket();
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType });
    const uploadUrl = await getSignedUrl(this.presignClient, command, { expiresIn: expiresInSeconds });
    return {
      objectKey,
      uploadUrl,
      method: 'PUT',
      // El Content-Type forma parte de la firma: el cliente debe enviar exactamente este.
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async list(prefix: string | undefined, limit: number): Promise<StoredObject[]> {
    await this.ensureBucket();
    const objects: StoredObject[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) {
        if (!item.Key) continue;
        objects.push({ key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified?.toISOString() ?? null });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token && objects.length < limit * 10);

    // S3 devuelve en orden alfabético; lo más útil es ver primero lo último que se subió.
    return objects
      .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))
      .slice(0, limit);
  }

  async stat(objectKey: string): Promise<StoredObject> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return { key: objectKey, size: head.ContentLength ?? 0, lastModified: head.LastModified?.toISOString() ?? null };
    } catch (error) {
      throw this.notFoundOr(error, objectKey);
    }
  }

  /** Lee el objeto como stream, sin cargarlo entero en memoria. */
  async openReadStream(objectKey: string): Promise<Readable> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return object.Body as Readable;
    } catch (error) {
      throw this.notFoundOr(error, objectKey);
    }
  }

  private notFoundOr(error: unknown, objectKey: string): unknown {
    const name = (error as { name?: string }).name;
    if (error instanceof NoSuchKey || error instanceof NotFound || name === 'NotFound' || name === 'NoSuchKey') {
      return new NotFoundException(`No existe el objeto ${objectKey} en el bucket ${this.bucket}`);
    }
    return error;
  }
}
