import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { normalizar, TuniDatosService } from './tuni-datos.service.js';
import { TuniDocumentosService } from './tuni-documentos.service.js';
import { TuniOpenaiService } from './tuni-openai.service.js';
import type { RespuestaTuni } from './tuni-respuesta.js';
import { consultas, esConsulta, instruccionesPorConsulta, type ChatBody } from './tuni.schemas.js';

const herramientas = Object.entries(instruccionesPorConsulta).map(([name, description]) => ({
  type: 'function',
  function: {
    name,
    description,
    strict: true,
    parameters: z.toJSONSchema(consultas[name as keyof typeof consultas], { target: 'draft-7' }),
  },
}));

const llamada = z.object({ name: z.string(), arguments: z.string() });
const seleccion = z.object({
  choices: z.array(z.object({
    message: z.object({ tool_calls: z.array(z.object({ function: llamada })).length(1) }),
  })).min(1),
});
const presentacion = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1).max(1200) }) })).min(1) });
const fechaLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' });

@Injectable()
export class TuniChatService {
  private readonly logger = new Logger(TuniChatService.name);

  constructor(
    private readonly datos: TuniDatosService,
    private readonly documentos: TuniDocumentosService,
    private readonly openai: TuniOpenaiService,
  ) {}

  async responder(body: ChatBody): Promise<RespuestaTuni> {
    const { message, history, consulta } = body;

    try {
      if (consulta === 'estado_mes') return await this.datos.estadoMes(null);
      if (consulta === 'ultimas_detecciones') return await this.datos.ultimasDetecciones(null, null, null);
      if (consulta === 'comparar_meses') return await this.datos.compararMeses(null, null, null);
      if (consulta === 'alertas_operativas') return await this.datos.alertasOperativas(null, null, false);
      const coincidencia = await this.consultaDirecta(message);
      if (coincidencia) return coincidencia;

      const herramienta = this.openai.disponible ? await this.seleccionar(message, history) : undefined;
      if (herramienta) return await this.ejecutar(herramienta, message);
      return {
        answer: 'Puedes consultar el estado del mes, las últimas detecciones o comparar el último mes completo con el año anterior usando los botones del chat.',
        dataSource: 'unavailable',
      };
    } catch (error) {
      this.logger.warn(`No se pudo completar una consulta de Tuni (${error instanceof Error ? error.name : 'Error'}).`);
      return {
        answer: 'No pude verificar los datos en este momento. Intenta de nuevo o consulta el módulo correspondiente.',
        dataSource: 'unavailable',
      };
    }
  }

  private async consultaDirecta(message: string): Promise<RespuestaTuni | undefined> {
    const texto = normalizar(message);
    if (/^(hola( tuni)?|buenos dias|buenas tardes|buenas noches)$/.test(texto)) return orientar('saludo');

    const zona = '(tunari|parque tunari|parque nacional tunari|cochabamba|municipio de cochabamba|distrito \\d{1,2})';
    const estado = new RegExp(`^(?:estado del mes(?: en| para)?|como esta|como va) (?:el |la )?${zona}(?: este mes)?$`).exec(texto);
    if (estado) return this.datos.estadoMes(estado[1]!);
    if (texto === 'estado del mes') return this.datos.estadoMes(null);

    const detecciones = new RegExp(`^(?:(?:donde (?:se vieron|se detectaron|estan) |muestra(?:me)? )?(?:los |las )?)ultim[oa]s (?:focos(?: de calor)?|detecciones(?: termicas)?)(?: (?:de|en) (?:el )?${zona})?$`).exec(texto);
    if (detecciones) return this.datos.ultimasDetecciones(detecciones[1] ?? null, null, null);
    const alertas = new RegExp(
      `^(?:hay alertas|que alertas hay|(?:las )?(?:ultimas )?alertas(?: (activas|pendientes|criticas|recientes))?)(?: (?:en|de|del) (?:el |la )?${zona})?$`,
    ).exec(texto);
    if (alertas) {
      const tipo = alertas[1];
      return this.datos.alertasOperativas(alertas[2] ?? null, tipo === 'criticas' ? 'Crítica' : null, tipo === 'pendientes');
    }
    if (/^(comparar ultimo mes completo|compara el ultimo mes completo con el ano anterior)$/.test(texto)) {
      return this.datos.compararMeses(null, null, null);
    }

    if (/^(que (?:es|son|significa|significan)|como se (?:armonizan|calcula|interpreta))\b/.test(texto) &&
        /\b(celdas? dias?|modis|viirs|armonizado|nrt|fuente persistente|alerta estadistica)\b/.test(texto)) {
      return this.metodologia(message);
    }
    return undefined;
  }

  private async seleccionar(message: string, history: ChatBody['history']): Promise<z.infer<typeof llamada> | undefined> {
    try {
      const instrucciones = `Eres Tuni, asistente de monitoreo forestal de TunariGuard. Selecciona una sola herramienta para la última pregunta. ` +
        `Hoy en Bolivia es ${fechaLocal.format(new Date())}. Resuelve las fechas relativas en el calendario de Bolivia. ` +
        'Usa el historial solo para aclarar referencias como «¿y en Cochabamba?». Si el área se menciona, conserva el nombre indicado. ' +
        'No conviertas una pregunta sobre confirmaciones o pronósticos en una consulta de actividad térmica. ' +
        'Usa orientar si el alcance, periodo o métrica solicitados no coinciden con las herramientas.';
      const resultado = await this.openai.chat<unknown>({
        messages: [
          { role: 'system', content: instrucciones },
          ...history.map(({ role, text }) => ({ role, content: text })),
          { role: 'user', content: message },
        ],
        tools: herramientas,
        tool_choice: 'required',
        parallel_tool_calls: false,
      });
      const parsed = seleccion.safeParse(resultado);
      return parsed.success ? parsed.data.choices[0]?.message.tool_calls[0]?.function : undefined;
    } catch {
      return undefined;
    }
  }

  private async ejecutar(tool: z.infer<typeof llamada>, pregunta: string): Promise<RespuestaTuni> {
    if (!esConsulta(tool.name)) return orientar('fuera_de_alcance');
    let args: unknown;
    try {
      args = JSON.parse(tool.arguments);
    } catch {
      return orientar('fuera_de_alcance');
    }

    switch (tool.name) {
      case 'estado_mes': {
        const parsed = consultas.estado_mes.safeParse(args);
        return parsed.success ? this.datos.estadoMes(parsed.data.area) : orientar('area');
      }
      case 'ultimas_detecciones': {
        const parsed = consultas.ultimas_detecciones.safeParse(args);
        return parsed.success
          ? this.datos.ultimasDetecciones(parsed.data.area, parsed.data.desde, parsed.data.hasta, parsed.data.satelite)
          : orientar('periodo');
      }
      case 'verificar_alerta': {
        const parsed = consultas.verificar_alerta.safeParse(args);
        return parsed.success
          ? this.datos.verificarAlerta(parsed.data.area, parsed.data.corte, parsed.data.satelite)
          : orientar('periodo');
      }
      case 'comparar_meses': {
        const parsed = consultas.comparar_meses.safeParse(args);
        return parsed.success
          ? this.datos.compararMeses(parsed.data.area, parsed.data.periodo, parsed.data.referencia)
          : orientar('periodo');
      }
      case 'alertas_operativas': {
        const parsed = consultas.alertas_operativas.safeParse(args);
        return parsed.success
          ? this.datos.alertasOperativas(parsed.data.area, parsed.data.severidad, parsed.data.solo_pendientes)
          : orientar('fuera_de_alcance');
      }
      case 'consultar_metodologia': {
        const parsed = consultas.consultar_metodologia.safeParse(args);
        return this.metodologia(parsed.success ? parsed.data.tema : pregunta, pregunta);
      }
      case 'orientar': {
        const parsed = consultas.orientar.safeParse(args);
        return orientar(parsed.success ? parsed.data.motivo : 'fuera_de_alcance');
      }
    }
  }

  private async metodologia(tema: string, pregunta?: string): Promise<RespuestaTuni> {
    const fragmento = await this.documentos.buscar(tema);
    if (!fragmento) return orientar('fuera_de_alcance');

    let answer = fragmento.texto;
    if (pregunta) {
      try {
        const resultado = await this.openai.chat<unknown>({
          messages: [
            { role: 'system', content: 'Explica el fragmento en español claro, usando solo lo que dice. Si el fragmento no responde la pregunta, indica que la documentación consultada no lo especifica. No afirmes cifras actuales, incendios confirmados ni pronósticos.' },
            { role: 'user', content: JSON.stringify({ pregunta, fragmento: fragmento.texto }) },
          ],
        });
        const parsed = presentacion.safeParse(resultado);
        if (parsed.success) answer = parsed.data.choices[0]!.message.content;
      } catch {
        // El fragmento recuperado también sirve como respuesta.
      }
    }
    return {
      answer,
      dataSource: 'documentation',
      source: { label: 'Abrir metodología', route: '/metodologia', section: fragmento.titulo },
    };
  }
}

function orientar(motivo: z.infer<typeof consultas.orientar>['motivo']): RespuestaTuni {
  switch (motivo) {
    case 'saludo':
      return {
        answer: '¡Hola! Puedo consultar el estado del mes, ubicar las últimas detecciones, comparar meses y explicar cómo interpreta TunariGuard esos datos.',
        dataSource: 'general_knowledge',
      };
    case 'area':
      return { answer: '¿Qué área quieres consultar? Puedes indicar el Parque Nacional Tunari, el municipio de Cochabamba o un distrito.', dataSource: 'unavailable' };
    case 'periodo':
      return { answer: '¿Qué fechas o meses quieres consultar?', dataSource: 'unavailable' };
    case 'fuera_de_alcance':
      return {
        answer: 'Puedo consultar el estado estadístico del mes, mostrar las detecciones recientes, comparar meses completos o buscar una explicación en la documentación de TunariGuard.',
        dataSource: 'unavailable',
      };
  }
}
