import { describe, expect, it, vi } from 'vitest';
import { sinNulosDeTexto, TuniChatService } from './tuni-chat.service.js';
import type { TuniDatosService } from './tuni-datos.service.js';
import { TuniController } from './tuni.controller.js';
import { TuniDocumentosService } from './tuni-documentos.service.js';
import type { TuniOpenaiService } from './tuni-openai.service.js';
import { chatSchema } from './tuni.schemas.js';
import { withLanguage } from '../../shared/i18n/language.js';

function servicio() {
  const ultimasDetecciones = vi.fn().mockResolvedValue({
    answer: 'No encontré detecciones para ese día.',
    dataSource: 'unavailable',
  });
  const openai = { disponible: true, chat: vi.fn() };
  const documentos = new TuniDocumentosService();
  const chat = new TuniChatService(
    { ultimasDetecciones } as unknown as TuniDatosService,
    documentos,
    openai as unknown as TuniOpenaiService,
  );
  const controller = new TuniController(chat, openai as unknown as TuniOpenaiService);
  return { chat, controller, documentos, ultimasDetecciones, openai };
}

const filtros = { area: 'parque-tunari', desde: '2026-10-25', hasta: '2026-10-30', satelite: 'VIIRS-NOAA-20' };

describe('guía del sistema en Tuni', () => {
  it('answers the Spanish question from the screenshot in English before asking the model', async () => {
    const { controller, openai } = servicio();
    openai.chat.mockResolvedValue({ choices: [{ message: { tool_calls: [{
      function: { name: 'orientar', arguments: '{"motivo":"fuera_de_alcance"}' },
    }] } }] });

    const respuesta = await controller.chat(chatSchema.parse({ message: 'Hola Tuni, Dime qué es TunariGuard' }), 'en-US');

    expect(respuesta).toMatchObject({ dataSource: 'documentation', language: 'en' });
    expect(respuesta.answer).toContain('web platform');
    expect(respuesta.answer).toContain('NASA FIRMS');
    expect(respuesta.citas).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sistema-panorama', language: 'en' })]));
    expect(openai.chat).not.toHaveBeenCalled();
  });

  it.each([
    { message: 'What database does TunariGuard use?', idioma: 'es-BO', language: 'es', id: 'sistema-arquitectura', respuesta: 'PostgreSQL con PostGIS' },
    { message: '¿Y de dónde sacan los datos?', idioma: 'en', language: 'en', id: 'sistema-datos', respuesta: 'provisional NRT data' },
    { message: '¿Cómo descargo reportes?', idioma: 'es', language: 'es', id: 'sistema-reportes', respuesta: 'GeoJSON' },
    { message: 'How do operational alerts work?', idioma: 'en', language: 'en', id: 'sistema-alertas', respuesta: 'same satellite overpass' },
  ])('responde «$message» con citas aunque el modelo esté desactivado', async ({ message, idioma, language, id, respuesta }) => {
    const { controller, openai } = servicio();
    openai.disponible = false;

    const resultado = await controller.chat(chatSchema.parse({ message }), idioma);

    expect(resultado).toMatchObject({ dataSource: 'documentation', language });
    expect(resultado.answer).toContain(respuesta);
    expect(resultado.citas).toEqual([expect.objectContaining({ id, language, texto: expect.any(String) })]);
    expect(openai.chat).not.toHaveBeenCalled();
  });

  it('recupera un tema técnico en ambos idiomas usando el mismo índice documental', async () => {
    const { documentos } = servicio();
    const [es, en] = await Promise.all([
      withLanguage('es', () => documentos.buscar(['PostGIS Prisma', 'celda-día'])),
      withLanguage('en', () => documentos.buscar(['PostGIS Prisma', 'cell-day'])),
    ]);

    expect(es.temasSinEvidencia).toEqual([]);
    expect(en.temasSinEvidencia).toEqual([]);
    expect(es.citas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sistema-arquitectura', language: 'es', texto: expect.stringContaining('PostgreSQL con PostGIS') }),
      expect.objectContaining({ id: 'fuentes_satelitales' }),
    ]));
    expect(en.citas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sistema-arquitectura', language: 'en', texto: expect.stringContaining('PostgreSQL with PostGIS') }),
      expect.objectContaining({ id: 'fuentes_satelitales', language: 'en' }),
    ]));
  });

  it('sigue consultando observaciones para preguntas sobre detecciones recientes', async () => {
    const { controller, ultimasDetecciones, openai } = servicio();

    await controller.chat(chatSchema.parse({ message: 'Recent hotspots in Tunari National Park' }), 'en');

    expect(ultimasDetecciones).toHaveBeenCalledExactlyOnceWith('parque nacional tunari', null, null);
    expect(openai.chat).not.toHaveBeenCalled();
  });
});

describe('seguimiento de detecciones en Tuni', () => {
  it('handles English greetings and follow-up dates without calling the model', async () => {
    const { chat, ultimasDetecciones, openai } = servicio();
    const greeting = await withLanguage('en', () => chat.responder(chatSchema.parse({ message: 'Hello Tuni' })));
    expect(greeting.answer).toContain('Hello! I can check the monthly status');
    await withLanguage('en', () => chat.responder(chatSchema.parse({
      message: 'And on October 25th?',
      history: [{ role: 'assistant', text: 'The last observation was on the 30th.', contextoDetecciones: filtros }],
    })));
    expect(ultimasDetecciones).toHaveBeenCalledExactlyOnceWith('parque-tunari', '2026-10-25', '2026-10-25', 'VIIRS-NOAA-20');
    expect(openai.chat).not.toHaveBeenCalled();
  });
  it.each(['y el 25?', 'Pero y en octubre 25?', '¿Y el veinticinco?'])('consulta un solo día para «%s»', async (message) => {
    const { chat, ultimasDetecciones, openai } = servicio();
    await chat.responder(chatSchema.parse({
      message,
      history: [{ role: 'assistant', text: 'La última observación fue el 30.', contextoDetecciones: filtros }],
    }));

    expect(ultimasDetecciones).toHaveBeenCalledExactlyOnceWith('parque-tunari', '2026-10-25', '2026-10-25', 'VIIRS-NOAA-20');
    expect(openai.chat).not.toHaveBeenCalled();
  });

  it('pide aclarar el mes cuando el rango anterior cubre dos meses', async () => {
    const { chat, ultimasDetecciones } = servicio();
    const respuesta = await chat.responder(chatSchema.parse({
      message: '¿y el 25?',
      history: [{
        role: 'assistant',
        text: 'Detecciones cargadas.',
        contextoDetecciones: { ...filtros, desde: '2026-09-25' },
      }],
    }));

    expect(respuesta.answer).toContain('¿Qué fecha exacta quieres consultar?');
    expect(ultimasDetecciones).not.toHaveBeenCalled();
  });
});

describe('argumentos de las herramientas', () => {
  it('convierte los textos "null", "none", "undefined" o vacíos en null de verdad', () => {
    expect(sinNulosDeTexto({ area: 'null', satelite: 'None', desde: '', hasta: '2024-08-31', corte: ' undefined ' })).toEqual({
      area: null,
      satelite: null,
      desde: null,
      hasta: '2024-08-31',
      corte: null,
    });
    expect(sinNulosDeTexto({ area: 'Distrito 9', periodos: ['2024-08', 'null'], solo_pendientes: false })).toEqual({
      area: 'Distrito 9',
      periodos: ['2024-08', null],
      solo_pendientes: false,
    });
  });
});
