import { describe, expect, it, vi } from 'vitest';
import { sinNulosDeTexto, TuniChatService } from './tuni-chat.service.js';
import type { TuniDatosService } from './tuni-datos.service.js';
import type { TuniDocumentosService } from './tuni-documentos.service.js';
import type { TuniOpenaiService } from './tuni-openai.service.js';
import { chatSchema } from './tuni.schemas.js';

function servicio() {
  const ultimasDetecciones = vi.fn().mockResolvedValue({
    answer: 'No encontré detecciones para ese día.',
    dataSource: 'unavailable',
  });
  const openai = { disponible: true, chat: vi.fn() };
  const chat = new TuniChatService(
    { ultimasDetecciones } as unknown as TuniDatosService,
    {} as TuniDocumentosService,
    openai as unknown as TuniOpenaiService,
  );
  return { chat, ultimasDetecciones, openai };
}

const filtros = { area: 'parque-tunari', desde: '2026-10-25', hasta: '2026-10-30', satelite: 'VIIRS-NOAA-20' };

describe('seguimiento de detecciones en Tuni', () => {
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
