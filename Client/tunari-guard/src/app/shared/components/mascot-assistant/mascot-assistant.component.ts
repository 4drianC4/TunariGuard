import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
// TUNARIGUARD_TUNI_VOICE_RADAR_V2
import { TuniEnhancementComponent } from '../tuni-enhancement/tuni-enhancement.component';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { LanguageService } from '../../../core/i18n/language.service';

type TuniEstado = 'bienvenida' | 'saludo' | 'alerta' | 'satelite' | 'ayuda';
type ChatItem = { role: 'tuni' | 'user'; text: string };
type TuniConsejo = { titulo: string; texto: string };
type ConsultaRapida = 'estado_mes' | 'ultimas_detecciones' | 'comparar_meses';
interface ReferenciaTuni {
  label: string;
  route: string;
  query?: Record<string, string>;
}
interface CitaTuni {
  id: string;
  titulo: string;
  texto: string;
  alcance?: string;
}
interface ContextoDetecciones {
  area: string;
  desde: string | null;
  hasta: string | null;
  satelite: string | null;
}
interface RespuestaTuni {
  answer: string;
  language?: 'es' | 'en';
  translationAvailable?: boolean;
  facts?: { label: string; value: string }[];
  source?: ReferenciaTuni;
  citas?: CitaTuni[];
  contextoDetecciones?: ContextoDetecciones;
  periodosIncendios?: { mes: number; anio: number | null }[];
}
type MensajeTuni = Omit<RespuestaTuni, 'answer'> & { role: 'user' | 'assistant'; text: string };

// TUNARIGUARD_TUNI_SABINA_V22
import { TuniSabinaVoiceComponent } from '../tuni-sabina-voice/tuni-sabina-voice.component';

@Component({
  selector: 'app-mascot-assistant',
  standalone: true,
  imports: [TuniSabinaVoiceComponent, RouterLink, TuniEnhancementComponent],
  templateUrl: './mascot-assistant.component.html',
  styleUrl: './mascot-assistant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MascotAssistantComponent implements OnInit, OnDestroy {
  // TUNI_VOZ_V3_START: audio exclusivo y conversacion por turnos
  private readonly http = inject(HttpClient);
  readonly i18n = inject(LanguageService);
  readonly pregunta = signal('');
  readonly respuestas = signal<MensajeTuni[]>([]);
  readonly consultasRapidas: { id: ConsultaRapida; label: string; pregunta: string }[] = [
    { id: 'estado_mes', label: 'Estado del mes', pregunta: '¿Cómo está el Tunari este mes?' },
    { id: 'ultimas_detecciones', label: 'Focos recientes', pregunta: '¿Dónde se vieron los últimos focos del Tunari?' },
    { id: 'comparar_meses', label: 'Comparar meses', pregunta: 'Compara el último mes completo con el año anterior en el Tunari.' },
  ];
  readonly procesando = signal(false);
  readonly grabando = signal(false);
  readonly errorIA = signal('');
  readonly conversacionContinua = signal(false);
  readonly reproduciendo = signal(false);
  readonly cargandoVoz = signal(false);
  readonly estadoVoz = signal('');
  private grabador?: MediaRecorder;
  private streamVoz?: MediaStream;
  private audioActual?: HTMLAudioElement;
  private urlAudio?: string;
  private solicitudVoz?: Subscription;
  private solicitudChat?: Subscription;
  private solicitudSTT?: Subscription;
  private audioContexto?: AudioContext;
  private temporizadorEscucha?: ReturnType<typeof setInterval>;
  private tiempoMaximoVoz?: ReturnType<typeof setTimeout>;
  private sesionVoz = 0;
  private iniciandoMicrofono = false;
  private readonly api = `${environment.apiBaseUrl}/tuni`;

  enviarPregunta(rapida?: { id: ConsultaRapida; pregunta: string }): void {
    const message = rapida?.pregunta ?? this.pregunta().trim();
    if (!message || this.procesando()) return;
    const history = this.respuestas().slice(-8).map(({ role, text, contextoDetecciones, periodosIncendios }) =>
      ({ role, text: text.slice(0, 1500), contextoDetecciones, periodosIncendios }),
    );
    if (!rapida) this.pregunta.set('');
    this.errorIA.set('');
    this.procesando.set(true);
    this.estadoVoz.set(this.i18n.language() === 'en' ? 'Tuni is thinking...' : 'Tuni está pensando...');
    this.respuestas.update(items => [...items, { role: 'user', text: message }]);
    const sesion = this.sesionVoz;
    this.solicitudChat = this.http.post<RespuestaTuni>(`${this.api}/chat`, { message, history, consulta: rapida?.id }).subscribe({
      next: r => {
        const { answer, ...detalle } = r;
        this.respuestas.update(items => [...items, { role: 'assistant', text: answer, ...detalle }]);
        if (this.i18n.language() === 'en' && r.language !== 'en') this.errorIA.set('English translation is temporarily unavailable. Tuni answered in Spanish.');
        this.procesando.set(false);
        if (this.conversacionContinua() && sesion === this.sesionVoz) this.reproducirVoz(r.answer, true);
        else this.estadoVoz.set('');
      },
      error: (error: HttpErrorResponse) => {
        this.procesando.set(false);
        this.errorIA.set(error.status === 404
          ? 'El servidor todavía no tiene habilitado el chat de Tuni.'
          : 'No se pudo consultar a Tuni. Intenta de nuevo en un momento.');
        this.detenerConversacion();
      },
    });
  }

  async alternarGrabacion(): Promise<void> {
    if (this.conversacionContinua()) return;
    if (this.grabando()) { this.detenerGrabacion(); return; }
    await this.iniciarGrabacion(false);
  }

  async alternarConversacion(): Promise<void> {
    if (this.conversacionContinua()) { this.detenerConversacion(); return; }
    this.detenerAudio();
    this.conversacionContinua.set(true);
    this.errorIA.set('');
    this.sesionVoz++;
    await this.iniciarGrabacion(true);
  }

  private async iniciarGrabacion(automatica: boolean): Promise<void> {
    if (this.iniciandoMicrofono || this.grabando() || this.procesando() || this.reproduciendo() || this.cargandoVoz()) return;
    this.iniciandoMicrofono = true;
    const sesion = this.sesionVoz;
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Micrófono no disponible');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sesion !== this.sesionVoz || (automatica && !this.conversacionContinua()) || !this.abierto()) {
        stream.getTracks().forEach(t => t.stop()); return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      this.streamVoz = stream;
      this.grabador = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        this.limpiarCaptura();
        if (sesion !== this.sesionVoz || (automatica && !this.conversacionContinua())) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1500) {
          if (automatica) this.reintentarEscucha(sesion);
          else this.errorIA.set('La grabación fue demasiado corta.');
          return;
        }
        const form = new FormData();
        form.append('audio', blob, blob.type.includes('mp4') ? 'voz.mp4' : 'voz.webm');
        this.procesando.set(true);
        this.estadoVoz.set('Transcribiendo...');
        this.solicitudSTT = this.http.post<{ text: string }>(`${this.api}/transcribe`, form).subscribe({
          next: r => {
            if (sesion !== this.sesionVoz) return;
            this.procesando.set(false);
            const texto = (r.text || '').trim();
            if (texto) { this.pregunta.set(texto); this.enviarPregunta(); }
            else if (automatica) this.reintentarEscucha(sesion);
            else this.errorIA.set('No se detectaron palabras en el audio.');
          },
          error: () => {
            if (sesion !== this.sesionVoz) return;
            this.procesando.set(false);
            this.errorIA.set('No se pudo transcribir el audio.');
            this.detenerConversacion();
          },
        });
      };
      recorder.start(250);
      this.grabando.set(true);
      this.estadoVoz.set('Escuchando...');
      // Limite de seguridad incluso si no se detecta silencio.
      this.tiempoMaximoVoz = setTimeout(() => this.detenerGrabacion(), automatica ? 12000 : 30000);
      if (automatica) this.activarDeteccionSilencio(stream, sesion);
    } catch {
      stream?.getTracks().forEach(t => t.stop());
      this.errorIA.set('No se pudo activar el micrófono. Usa localhost o HTTPS y permite el acceso.');
      this.detenerConversacion();
    } finally { this.iniciandoMicrofono = false; }
  }

  private activarDeteccionSilencio(stream: MediaStream, sesion: number): void {
    try {
      const contexto = new AudioContext();
      this.audioContexto = contexto;
      const fuente = contexto.createMediaStreamSource(stream);
      const analizador = contexto.createAnalyser();
      analizador.fftSize = 1024;
      fuente.connect(analizador);
      const muestras = new Uint8Array(analizador.fftSize);
      const inicio = Date.now();
      let ultimaVoz = inicio;
      let detectoVoz = false;
      this.temporizadorEscucha = setInterval(() => {
        if (sesion !== this.sesionVoz || !this.grabando()) return;
        analizador.getByteTimeDomainData(muestras);
        let energia = 0;
        for (const valor of muestras) { const x = (valor - 128) / 128; energia += x * x; }
        const rms = Math.sqrt(energia / muestras.length);
        if (rms > 0.025) { ultimaVoz = Date.now(); detectoVoz = true; }
        if (detectoVoz && Date.now() - ultimaVoz > 1400 && Date.now() - inicio > 1700) this.detenerGrabacion();
        if (!detectoVoz && Date.now() - inicio > 6500) this.detenerGrabacion();
      }, 180);
    } catch { /* El límite de 12 s permanece activo. */ }
  }

  private detenerGrabacion(): void {
    if (this.grabador?.state === 'recording') this.grabador.stop();
    else this.limpiarCaptura();
  }

  private limpiarCaptura(): void {
    if (this.temporizadorEscucha) clearInterval(this.temporizadorEscucha);
    if (this.tiempoMaximoVoz) clearTimeout(this.tiempoMaximoVoz);
    this.temporizadorEscucha = undefined;
    this.tiempoMaximoVoz = undefined;
    void this.audioContexto?.close().catch(() => {});
    this.audioContexto = undefined;
    this.streamVoz?.getTracks().forEach(t => t.stop());
    this.streamVoz = undefined;
    this.grabador = undefined;
    this.grabando.set(false);
  }

  private reintentarEscucha(sesion: number): void {
    if (this.conversacionContinua() && sesion === this.sesionVoz && this.abierto()) {
      this.estadoVoz.set('Esperando tu voz...');
      void this.iniciarGrabacion(true);
    }
  }

  escuchar(text: string): void {
    if (this.conversacionContinua()) return;
    if (this.reproduciendo() || this.cargandoVoz()) { this.detenerAudio(); return; }
    this.reproducirVoz(text, false);
  }

  private reproducirVoz(text: string, automatica: boolean): void {
    if (this.reproduciendo() || this.cargandoVoz()) return;
    const sesion = this.sesionVoz;
    this.cargandoVoz.set(true);
    this.estadoVoz.set('Preparando voz...');
    this.solicitudVoz = this.http.post(`${this.api}/speech`, { text }, { responseType: 'blob' }).subscribe({
      next: blob => {
        if (sesion !== this.sesionVoz || (automatica && !this.conversacionContinua())) { this.cargandoVoz.set(false); return; }
        this.cargandoVoz.set(false);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.urlAudio = url;
        this.audioActual = audio;
        this.reproduciendo.set(true);
        this.estadoVoz.set('Tuni está hablando...');
        audio.onended = () => {
          if (this.audioActual !== audio) return;
          this.detenerAudio();
          if (automatica) this.reintentarEscucha(sesion);
        };
        audio.onerror = () => {
          if (this.audioActual !== audio) return;
          this.detenerAudio();
          this.errorIA.set('No se pudo reproducir el audio.');
          if (automatica) this.detenerConversacion();
        };
        void audio.play().catch(() => {
          if (this.audioActual !== audio) return;
          this.detenerAudio();
          this.errorIA.set('El navegador bloqueó el audio. Pulsa el botón de escuchar para habilitarlo.');
          if (automatica) this.detenerConversacion();
        });
      },
      error: () => {
        this.cargandoVoz.set(false);
        this.estadoVoz.set('');
        this.errorIA.set('No se pudo generar la voz de Tuni.');
        if (automatica) this.detenerConversacion();
      },
    });
  }

  detenerAudio(): void {
    this.solicitudVoz?.unsubscribe();
    this.solicitudVoz = undefined;
    if (this.audioActual) {
      this.audioActual.onended = null;
      this.audioActual.onerror = null;
      this.audioActual.pause();
      this.audioActual.src = '';
      this.audioActual = undefined;
    }
    if (this.urlAudio) URL.revokeObjectURL(this.urlAudio);
    this.urlAudio = undefined;
    this.reproduciendo.set(false);
    this.cargandoVoz.set(false);
    this.estadoVoz.set('');
  }

  detenerConversacion(): void {
    this.conversacionContinua.set(false);
    this.sesionVoz++;
    this.detenerGrabacion();
    this.detenerAudio();
    this.solicitudSTT?.unsubscribe();
    this.solicitudChat?.unsubscribe();
    this.procesando.set(false);
    this.estadoVoz.set('');
  }
  // TUNI_VOZ_V3_END

  readonly abierto = signal(false);
  readonly estado = signal<TuniEstado>('bienvenida');
  readonly movimiento = signal(true);
  readonly inclinacion = signal(0);

  // TUNARIGUARD_TUNI_GUIDE_V1_START: consejos contextuales por ruta.
  readonly consejoVisible = signal(false);
  readonly secuenciaConsejo = signal(0);
  readonly consejoActual = signal<TuniConsejo>({ titulo: 'Consejo de Tuni', texto: 'Explora TunariGuard con ayuda de Tuni.' });
  private readonly enrutador = inject(Router);
  private suscripcionRutas?: Subscription;
  private temporizadorConsejo?: ReturnType<typeof setTimeout>;
  private readonly duracionConsejoMs = 30_000;
  private readonly consejos: Record<string, TuniConsejo> = {
    '/inicio': { titulo: 'Bienvenido a TunariGuard', texto: 'Revisa los indicadores generales y entra al mapa para explorar los focos de calor.' },
    '/mapa': { titulo: 'Explora el mapa de focos', texto: 'Selecciona un punto y utiliza los filtros para consultar sus características y procedencia.' },
    '/historial': { titulo: 'Consulta el historial', texto: 'Compara fechas y sensores para analizar cómo cambia la actividad térmica con el tiempo.' },
    '/armonizacion': { titulo: 'MODIS + VIIRS', texto: 'Conoce cómo se relacionan observaciones de ambos sensores y consulta sus coincidencias.' },
    '/alertas': { titulo: 'Prioriza las alertas', texto: 'Filtra por severidad y distrito; revisa el estado de seguimiento antes de actuar.' },
    '/distritos': { titulo: 'Analiza cada distrito', texto: 'Elige un distrito para ver su actividad térmica, evolución y nivel de riesgo DEMO.' },
    '/reportes': { titulo: 'Genera tu reporte', texto: 'Aplica un rango de fechas y exporta un resumen por distrito, severidad o fuente.' },
    '/proyecciones': { titulo: 'Configura una proyección', texto: 'Cambia la serie, el modelo y el escenario. Recuerda: los pronósticos mostrados son DEMO.' },
    '/metodologia': { titulo: 'Conoce el método', texto: 'Revisa las fuentes MODIS y VIIRS, los pasos de armonización y sus limitaciones.' },
  };

  ngOnInit(): void {
    this.actualizarConsejoPorRuta(this.enrutador.url);
    this.suscripcionRutas = this.enrutador.events.subscribe(evento => {
      if (evento instanceof NavigationEnd) {
        this.actualizarConsejoPorRuta(evento.urlAfterRedirects);
      }
    });
  }

  ngOnDestroy(): void {
    this.suscripcionRutas?.unsubscribe();
    this.cancelarTemporizadorConsejo();
    this.detenerConversacion();
  }

  private actualizarConsejoPorRuta(url: string): void {
    const ruta = (url.split(/[?#]/)[0].replace(/\/+$/, '') || '/inicio').toLowerCase();
    this.consejoActual.set(this.consejos[ruta] ?? this.consejos['/inicio']);
    this.cancelarTemporizadorConsejo();
    // Si la persona esta usando el chat, no interrumpirlo con una burbuja.
    if (this.abierto()) {
      this.consejoVisible.set(false);
      return;
    }
    this.secuenciaConsejo.update(numero => numero + 1);
    this.consejoVisible.set(true);
    this.temporizadorConsejo = setTimeout(() => {
      this.consejoVisible.set(false);
      this.temporizadorConsejo = undefined;
    }, this.duracionConsejoMs);
  }

  private cancelarTemporizadorConsejo(): void {
    if (this.temporizadorConsejo !== undefined) {
      clearTimeout(this.temporizadorConsejo);
      this.temporizadorConsejo = undefined;
    }
  }

  cerrarConsejo(): void {
    this.cancelarTemporizadorConsejo();
    this.consejoVisible.set(false);
  }

  abrirAyudaDeEstaVista(): void {
    this.cerrarConsejo();
    this.elegir('ayuda');
  }
  // TUNARIGUARD_TUNI_GUIDE_V1_END

  readonly chat = computed<ChatItem[]>(() => {
    switch (this.estado()) {
      case 'saludo':
        return [
          { role: 'user', text: 'Hola Tuni' },
          { role: 'tuni', text: '¡Hola! Soy tu asistente de ayuda dentro de TunariGuard.' },
          { role: 'tuni', text: 'Puedo acompañarte, explicarte el sistema y orientarte sin tapar demasiado el contenido.' },
        ];
      case 'alerta':
        return [
          { role: 'user', text: '¿Qué pasa si hay una alerta?' },
          { role: 'tuni', text: 'Esta es una simulación visual. Sirve para representar focos de calor o eventos que requieren atención.' },
          { role: 'tuni', text: 'Después puedes revisar el mapa, el historial y los detalles de la detección.' },
        ];
      case 'satelite':
        return [
          { role: 'user', text: 'Explícame la parte satelital' },
          { role: 'tuni', text: 'TunariGuard usa fuentes como MODIS y VIIRS para observar puntos de calor.' },
          { role: 'tuni', text: 'La plataforma puede mostrar mapas, historial y apoyo visual para brigadas y monitoreo forestal.' },
        ];
      case 'ayuda':
        return [
          { role: 'user', text: '¿En qué me puedes ayudar?' },
          { role: 'tuni', text: 'Puedo explicarte cómo funciona el sistema, qué significan las alertas y cómo interpretar el mapa.' },
          { role: 'tuni', text: 'También puedo servir como guía rápida para navegar entre módulos y entender la información satelital.' },
        ];
      default:
        return [
          { role: 'tuni', text: 'Bienvenido a TunariGuard. Soy Tuni, tu asistente de ayuda.' },
          { role: 'tuni', text: 'Pregúntame por la actividad del Tunari, los focos recientes o cómo se interpretan los datos satelitales.' },
        ];
    }
  });

  readonly titulo = computed(() => {
    switch (this.estado()) {
      case 'saludo': return 'Inicio';
      case 'alerta': return 'Alerta';
      case 'satelite': return 'Satélite';
      case 'ayuda': return 'Ayuda';
      default: return 'Asistente';
    }
  });

  alternar(): void { const abrir = !this.abierto(); if (!abrir) this.detenerConversacion(); this.abierto.set(abrir); if (abrir) this.cerrarConsejo(); }
  cerrar(): void { this.detenerConversacion(); this.abierto.set(false); }
  elegir(estado: TuniEstado): void {
    this.cerrarConsejo();
    this.estado.set(estado);
    this.abierto.set(true);
    this.inclinacion.set(0);
  }
  alternarMovimiento(): void {
    this.movimiento.update(valor => !valor);
    this.inclinacion.set(0);
  }
  seguirPuntero(evento: PointerEvent): void {
    if (!this.movimiento() || evento.pointerType === 'touch') return;
    const elemento = evento.currentTarget as HTMLElement | null;
    if (!elemento) return;
    const rectangulo = elemento.getBoundingClientRect();
    const fraccion = (evento.clientX - rectangulo.left) / (rectangulo.width || 1);
    this.inclinacion.set(Math.max(-3.5, Math.min(3.5, Math.round((fraccion - 0.5) * 7 * 10) / 10)));
  }
  reiniciarPuntero(): void { this.inclinacion.set(0); }
}
