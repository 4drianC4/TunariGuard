import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { Env } from './infrastructure/config/env.schema.js';
import { ConfiguredIoAdapter } from './infrastructure/websocket/configured-io.adapter.js';

const API_PREFIX = 'api/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({ origin: corsOrigins });
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, corsOrigins));
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('Tunari Guard API')
    .setDescription(
      'Focos de calor MODIS y VIIRS para el Parque Nacional Tunari y los 15 distritos de Cochabamba. ' +
        'Una detección térmica no confirma un incendio.',
    )
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi));

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `API en http://localhost:${port}/${API_PREFIX} · docs en /api/docs · Socket.IO en /realtime`,
    'Bootstrap',
  );
}
await bootstrap();
