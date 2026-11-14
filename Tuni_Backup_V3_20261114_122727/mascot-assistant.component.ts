import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

type TuniEstado = 'bienvenida' | 'saludo' | 'alerta' | 'satelite' | 'ayuda';
type ChatItem = { role: 'tuni' | 'user'; text: string };
type TuniConsejo = { titulo: string; texto: string };

@Component({
  selector: 'app-mascot-assistant',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './mascot-assistant.component.html',
  styleUrl: './mascot-assistant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MascotAssistantComponent implements OnInit, OnDestroy {
  // TUNI_AI_V1 — IA, STT y TTS
  private readonly http = inject(HttpClient);
  readonly pregunta = signal('');
  readonly respuestas = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
  readonly procesando = signal(false);
  readonly grabando = signal(false);
  readonly errorIA = signal('');
  private grabador?: MediaRecorder;
  private audioActual?: HTMLAudioElement;
  private api = '/api/v1/tuni';

  enviarPregunta(): void {
    const message = this.pregunta().trim();
    if (!message || this.procesando()) return;
    const history = this.respuestas().slice(-8);
    this.pregunta.set(''); this.errorIA.set(''); this.procesando.set(true);
    this.respuestas.update(items => [...items, { role: 'user', text: message }]);
    this.http.post<{ answer: string }>(`${this.api}/chat`, { message, history }).subscribe({
      next: r => { this.respuestas.update(items => [...items, { role: 'assistant', text: r.answer }]); this.procesando.set(false); },
      error: () => { this.errorIA.set('No se pudo consultar a Tuni. Verifica el servidor y la configuración de IA.'); this.procesando.set(false); },
    });
  }
  async alternarGrabacion(): Promise<void> {
    if (this.grabando()) { this.grabador?.stop(); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Error('Micrófono no disponible');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      this.grabador = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        this.grabando.set(false); stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const form = new FormData(); form.append('audio', blob, blob.type.includes('mp4') ? 'voz.mp4' : 'voz.webm');
        this.procesando.set(true);
        this.http.post<{ text: string }>(`${this.api}/transcribe`, form).subscribe({
          next: r => { this.pregunta.set(r.text); this.procesando.set(false); if (r.text.trim()) this.enviarPregunta(); },
          error: () => { this.errorIA.set('No se pudo transcribir el audio.'); this.procesando.set(false); },
        });
      };
      recorder.start(); this.grabando.set(true);
    } catch { this.errorIA.set('Permite el micrófono y usa HTTPS o localhost.'); this.grabando.set(false); }
  }
  escuchar(text: string): void {
    this.audioActual?.pause();
    this.http.post(`${this.api}/speech`, { text }, { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url); this.audioActual = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        void audio.play().catch(() => this.errorIA.set('El navegador bloqueó la reproducción de audio.'));
      },
      error: () => this.errorIA.set('No se pudo generar la voz de Tuni.'),
    });
  }


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
          { role: 'tuni', text: 'Puedo darte una bienvenida, simular alertas, explicar la parte satelital y orientarte dentro del sistema.' },
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

  alternar(): void { const abrir = !this.abierto(); this.abierto.set(abrir); if (abrir) this.cerrarConsejo(); }
  cerrar(): void { this.abierto.set(false); }
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
