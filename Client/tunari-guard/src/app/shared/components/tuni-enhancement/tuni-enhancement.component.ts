import { LanguageService } from '../../../core/i18n/language.service';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LiveUpdatesService } from '../../../application/services/live-updates.service';
import { environment } from '../../../../environments/environment';

interface VoiceAlternative { transcript: string; }
interface VoiceResult { readonly isFinal: boolean; readonly length: number; readonly [index: number]: VoiceAlternative; }
interface VoiceEvent { readonly results: ArrayLike<VoiceResult>; }
interface SpeechEngine {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: VoiceEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechEngineCtor = new () => SpeechEngine;
type VoiceMode = 'idle' | 'requesting' | 'listening' | 'sending' | 'waiting' | 'ready' | 'error';
interface ObservationDto {
  id?: string;
  acquiredAtUtc?: string;
  confidenceLevel?: string | null;
  source?: string;
  sensor?: string;
  district?: { name?: string } | null;
}
interface ApiList { items?: ObservationDto[]; nextCursor?: string | null; }
interface RadarEvent { id: string; time: string; district: string; sensor: string; }

/**
 * Complemento no invasivo de Tuni: NO reemplaza su API de chat.
 * El radar muestra observaciones de alta confianza, NO incendios confirmados.
 */
@Component({
  selector: 'app-tuni-enhancement',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (radar(); as evento) {
      @if (!chatAbierto) {
        <aside class="tuni-v2-radar" role="status" [attr.aria-label]="t('Detección térmica relevante')">
          <span class="tuni-v2-radar__sweep" aria-hidden="true"><span class="tuni-v2-radar__spot"></span></span>
          <div class="tuni-v2-radar__info">
            <strong>{{ t('Actividad térmica detectada') }}</strong>
            <small>{{ i18n.area(evento.district) }} · {{ evento.sensor }}</small>
            <p>{{ t('Confianza alta · detección sin verificar en tierra.') }}</p>
            <a routerLink="/mapa">{{ t('Consultar en el mapa') }}</a>
          </div>
          <button type="button" class="tuni-v2-radar__close" (click)="ocultarRadar()" [attr.aria-label]="t('Cerrar radar')">×</button>
        </aside>
      }
    }
  `,
  styles: [':host{display:contents;pointer-events:none}'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TuniEnhancementComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly i18n = inject(LanguageService);
  readonly t = this.i18n.text;
  @Input() chatAbierto = false;
  readonly radar = signal<RadarEvent | null>(null);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly live = inject(LiveUpdatesService);
  private readonly subscription = new Subscription();
  private readonly abortion = new AbortController();
  private watcher?: MutationObserver;
  private pollTimer?: ReturnType<typeof setInterval>;
  private stopTimer?: ReturnType<typeof setTimeout>;
  private waitingTimer?: ReturnType<typeof setTimeout>;
  private voiceTimer?: ReturnType<typeof setInterval>;
  private readonly sessionStartedAt = { value: 0 };
  private manualRadarDismissal = '';
  private currentMic: HTMLButtonElement | null = null;
  private currentInput: HTMLInputElement | HTMLTextAreaElement | null = null;
  private currentSend: HTMLButtonElement | null = null;
  private statusNode: HTMLElement | null = null;
  private speech?: SpeechEngine;
  private voiceMode: VoiceMode = 'idle';
  private finalText = '';
  private originalText = '';
  private sent = false;
  private lastResponseCount = 0;
  private observerBusy = false;
  private abortForClose = false;
  private inlineRadarId = '';

  // Cast explicitly: Angular's ElementRef.nativeElement can be inferred as any.
  // Without this, TypeScript loses element types and querySelectorAll<T>() fails.
  private getPanel(): HTMLElement | null {
    const hostElement = this.host.nativeElement as HTMLElement;
    const parent: HTMLElement | null = hostElement.parentElement;
    return parent?.querySelector<HTMLElement>('.chat-panel') ?? null;
  }

  ngOnInit(): void {
    if (environment.mapDataOrigin === 'BACKEND') {
      void this.checkObservations();
      this.pollTimer = setInterval(() => void this.checkObservations(), 60_000);
      this.subscription.add(this.live.observationsChanged$.subscribe(() => void this.checkObservations()));
    }
  }

  ngAfterViewInit(): void {
    const root = (this.host.nativeElement as HTMLElement).parentElement;
    if (!root) return;
    this.watcher = new MutationObserver(() => this.queueBind());
    // No observar atributos ni texto: el estado de grabacion no debe causar un bucle.
    this.watcher.observe(root, { childList: true, subtree: true });
    this.queueBind();
  }

  ngOnDestroy(): void {
    this.abortion.abort();
    this.subscription.unsubscribe();
    this.watcher?.disconnect();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.clearSpeechTimers();
    this.speech?.abort();
    this.detachMic();
    this.statusNode?.remove();
  }

  ocultarRadar(): void {
    this.manualRadarDismissal = this.radar()?.id ?? '';
    this.radar.set(null);
    this.syncRadarInChat();
  }

  private async checkObservations(): Promise<void> {
    if (this.abortion.signal.aborted) return;
    const options = new URLSearchParams({
      from: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      origin: 'REAL',
      minConfidence: 'HIGH',
      detectionType: 'vegetation',
      bbox: '-66.8,-17.7,-65.7,-16.8',
      format: 'json',
      limit: '50',
    });
    try {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      this.abortion.signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, 7000);
      let response: Response;
      try {
        response = await this.i18n.fetch(`${environment.apiBaseUrl.replace(/\/$/, '')}/observations?${options}`, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
        this.abortion.signal.removeEventListener('abort', cancel);
      }
      if (!response.ok) { this.radar.set(null); this.syncRadarInChat(); return; }
      const data = await response.json() as ApiList;
      if (!Array.isArray(data.items)) { this.radar.set(null); this.syncRadarInChat(); return; }
      const selected = data.items.find(item =>
        !!item.id && item.source !== 'SIMULATED' && item.confidenceLevel === 'HIGH' &&
        !!item.acquiredAtUtc && Date.parse(item.acquiredAtUtc) >= Date.now() - 48 * 60 * 60 * 1000
      );
      if (!selected?.id || selected.id === this.manualRadarDismissal) {
        this.radar.set(null);
        this.syncRadarInChat();
        return;
      }
      this.radar.set({
        id: selected.id,
        district: selected.district?.name || 'Área de monitoreo',
        sensor: selected.sensor || 'MODIS / VIIRS',
        time: selected.acquiredAtUtc || '',
      });
      this.syncRadarInChat();
    } catch {
      // No mostrar un radar si la API no confirma datos recientes.
      if (!this.abortion.signal.aborted) { this.radar.set(null); this.syncRadarInChat(); }
    }
  }

  private queueBind(): void {
    if (this.observerBusy) return;
    this.observerBusy = true;
    queueMicrotask(() => { this.observerBusy = false; this.bindComposer(); });
  }

  private bindComposer(): void {
    const panel = this.getPanel();
    if (!panel) {
      if (this.currentMic) this.detachMic();
      if (this.speech) {
        this.abortForClose = true;
        this.speech.abort();
        this.speech = undefined;
        this.voiceMode = 'idle';
      }
      this.statusNode = null;
      return;
    }
    const inputs = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'));
    const input = inputs.find(el => /pregunt|escrib|mensaje|tuni|chat/i.test(el.placeholder || el.getAttribute('aria-label') || ''));
    if (!input) return; // La version sin voz de GitHub mantiene intacto su chat.
    const possible = input.closest('form, [class*="composer"], [class*="prompt"], [class*="input-row"], [class*="chat-input"]') || input.parentElement?.parentElement;
    if (!possible) return;
    const buttons = Array.from(possible.querySelectorAll<HTMLButtonElement>('button'));
    const isMic = (button: HTMLButtonElement): boolean =>
      /micro|grabar|escuch|dicta|voz|voice|speech|record|mic\b/i.test(
        [button.className, button.title, button.getAttribute('aria-label'), button.getAttribute('data-testid'), button.innerText].join(' ')
      ) || !!button.querySelector('.lucide-mic,[data-lucide="mic"],.fa-microphone');
    const isSend = (button: HTMLButtonElement): boolean =>
      /enviar|send|submit|paper-plane|arrow-up/i.test([button.className, button.title, button.getAttribute('aria-label'), button.innerText].join(' '));
    let mic = buttons.find(isMic);
    if (!mic && buttons.length === 2) mic = buttons[0]; // Botones microfono / enviar en fila.
    const send = buttons.find(isSend) || buttons.find(button => button !== mic && button.type === 'submit') || buttons.find(button => button !== mic);
    if (!mic || !send) return;
    this.currentInput = input;
    this.currentSend = send;
    this.syncRadarInChat();
    if (this.currentMic !== mic) {
      this.detachMic();
      this.currentMic = mic;
      mic.addEventListener('click', this.onMicClick, { capture: true });
      mic.setAttribute('data-tuni-voice-v2', 'true');
    }
    if (!this.statusNode || !panel.contains(this.statusNode)) {
      const status = document.createElement('div');
      status.className = 'tuni-v2-voice-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.hidden = true;
      const indicator = document.createElement('span');
      indicator.className = 'tuni-v2-voice-dot';
      indicator.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'tuni-v2-voice-text';
      status.append(indicator, text);
      possible.before(status);
      this.statusNode = status;
    }
    this.renderVoiceStatus();
  }

  private syncRadarInChat(): void {
    const panel = this.getPanel();
    if (!panel) { this.inlineRadarId = ''; return; }
    const target = panel.querySelector('.chat-content');
    if (!target) return;
    const alert = this.radar();
    let card = target.querySelector<HTMLElement>('.tuni-v2-inline-radar');
    if (!alert) { card?.remove(); this.inlineRadarId = ''; return; }
    const localizedId = `${alert.id}:${this.i18n.language()}`;
    if (card && this.inlineRadarId === localizedId) return;
    if (!card) {
      card = document.createElement('div');
      card.className = 'tuni-v2-inline-radar';
      card.setAttribute('role', 'status');
      target.appendChild(card);
    }
    card.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = this.t('📡 Tuni detecto actividad termica relevante');
    const description = document.createElement('p');
    description.textContent = `${this.i18n.area(alert.district)} · ${alert.sensor} · ${this.t('Alta confianza. No confirma un incendio.')}`;
    const link = document.createElement('a');
    link.href = '/mapa';
    link.textContent = this.t('Revisar detecciones en el mapa');
    card.append(label, description, link);
    this.inlineRadarId = localizedId;
  }

  private readonly onMicClick = (event: MouseEvent): void => {
    if (!this.currentInput || !this.currentSend) return;
    // No intervenir en un modo continuo ya activo en la version local del chat.
    const panel = this.getPanel();
    const continuousOn = Array.from(panel?.querySelectorAll<HTMLButtonElement>('button') ?? []).some(button => {
      if (button === this.currentMic) return false;
      const desc = [button.title, button.getAttribute('aria-label'), button.innerText].join(' ');
      return /continu|manos libres|always listening/i.test(desc) && button.getAttribute('aria-pressed') === 'true';
    });
    if (continuousOn) {
      this.showStatus('ready', 'Conversacion continua activa: Tuni controla el microfono.');
      return;
    }
    const platform = window as Window & { SpeechRecognition?: SpeechEngineCtor; webkitSpeechRecognition?: SpeechEngineCtor };
    const Constructor = platform.SpeechRecognition ?? platform.webkitSpeechRecognition;
    if (!Constructor) {
      // Conserva la funcion de voz anterior en navegadores sin Web Speech.
      this.showStatus('error', 'El indicador avanzado requiere Chrome o Edge. Se usa el microfono original.');
      return;
    }
    // Solo la accion de dictado: evitar que la grabacion antigua se inicie a la vez.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (this.voiceMode === 'requesting' || this.voiceMode === 'listening') {
      this.speech?.stop();
      return;
    }
    if (this.voiceMode === 'sending' || this.voiceMode === 'waiting') {
      this.showStatus('waiting', 'Tuni sigue procesando tu mensaje.');
      return;
    }
    this.clearSpeechTimers();
    this.finalText = '';
    this.sent = false;
    this.abortForClose = false;
    this.originalText = this.currentInput.value.trim();
    this.sessionStartedAt.value = Date.now();
    let speech: SpeechEngine;
    try { speech = new Constructor(); } catch {
      this.showStatus('error', 'No fue posible iniciar el reconocimiento de voz.');
      return;
    }
    this.speech = speech;
    speech.lang = this.i18n.locale();
    speech.continuous = false;
    speech.interimResults = true;
    speech.maxAlternatives = 1;
    speech.onstart = () => {
      this.showStatus('listening', 'Grabando · 0 s · Habla ahora');
      this.voiceTimer = setInterval(() => {
        if (this.voiceMode === 'listening') {
          const seconds = Math.floor((Date.now() - this.sessionStartedAt.value) / 1000);
          this.showStatus('listening', this.t('Grabando · {seconds} s · Pulsa el microfono para terminar', { seconds }));
        }
      }, 1000);
    };
    speech.onresult = (result: VoiceEvent) => {
      let completed = '';
      let partial = '';
      for (let i = 0; i < result.results.length; i++) {
        const entry = result.results[i];
        const words = entry?.[0]?.transcript || '';
        if (entry?.isFinal) completed += words + ' ';
        else partial += words + ' ';
      }
      this.finalText = completed.trim();
      const preview = [this.originalText, this.finalText, partial.trim()].filter(Boolean).join(' ').trim();
      this.updateInput(preview);
      this.showStatus('listening', preview ? this.t('Escuchando · {preview}', { preview: preview.slice(-75) }) : 'Escuchando tu voz...');
      if (this.finalText) {
        if (this.stopTimer) clearTimeout(this.stopTimer);
        // Finalizado el reconocimiento, no esperar varios segundos extra.
        this.stopTimer = setTimeout(() => this.speech?.stop(), 450);
      }
    };
    speech.onerror = error => {
      this.clearSpeechTimers();
      this.finalText = '';
      this.showStatus('error', error.error === 'not-allowed' || error.error === 'service-not-allowed'
        ? 'Permiso de microfono denegado. Activalo en el navegador.'
        : error.error === 'no-speech' ? 'No se detecto voz. Pulsa el microfono para reintentar.'
          : this.t('No se pudo reconocer la voz ({reason}).', { reason: error.error }));
    };
    speech.onend = () => {
      this.clearSpeechTimers();
      this.speech = undefined;
      if (this.abortForClose) { this.showStatus('idle', ''); return; }
      if (!this.finalText) {
        if (this.voiceMode !== 'error') this.showStatus('error', 'No se transcribio ninguna frase. Intentalo otra vez.');
        return;
      }
      this.updateInput([this.originalText, this.finalText].filter(Boolean).join(' '));
      this.sendOnce();
    };
    this.showStatus('requesting', 'Solicitando permiso para grabar...');
    try { speech.start(); } catch {
      this.speech = undefined;
      this.showStatus('error', 'No se pudo iniciar el microfono. Prueba nuevamente.');
    }
  };

  private sendOnce(): void {
    if (this.sent) return;
    const button = this.currentSend;
    if (!button || button.disabled) {
      this.showStatus('ready', 'Texto transcrito. Presiona Enviar para continuar.');
      return;
    }
    this.sent = true;
    const panel = this.getPanel();
    this.lastResponseCount = panel?.querySelectorAll('.chat-message.from-tuni,.from-tuni').length ?? 0;
    this.showStatus('sending', 'Transcripcion enviada. Esperando respuesta de Tuni...');
    button.click(); // Mantiene intacto el endpoint y la logica de chat ya instalados.
    this.showStatus('waiting', 'Tuni esta preparando su respuesta...');
    this.waitingTimer = setTimeout(() => {
      if (this.voiceMode === 'waiting') this.showStatus('ready', 'El envio termino. Si Tuni tarda, revisa la conexion de la API.');
    }, 20000);
  }

  private updateInput(value: string): void {
    const input = this.currentInput;
    if (!input) return;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private showStatus(mode: VoiceMode, message: string): void {
    this.voiceMode = mode;
    if (this.currentMic) this.currentMic.setAttribute('aria-pressed', String(mode === 'listening' || mode === 'requesting'));
    if (this.statusNode) {
      this.statusNode.hidden = mode === 'idle';
      this.statusNode.dataset['state'] = mode;
      const text = this.statusNode.querySelector('.tuni-v2-voice-text');
      if (text) text.textContent = this.t(message);
    }
  }

  private renderVoiceStatus(): void {
    if (this.statusNode) {
      this.statusNode.hidden = this.voiceMode === 'idle';
      this.statusNode.dataset['state'] = this.voiceMode;
    }
    // Detectar la nueva respuesta del chat sin interpretar mensajes DEMO como respuesta de API.
    if (this.voiceMode === 'waiting') {
      const panel = this.getPanel();
      const count = panel?.querySelectorAll('.chat-message.from-tuni,.from-tuni').length ?? 0;
      if (count > this.lastResponseCount) {
        if (this.waitingTimer) clearTimeout(this.waitingTimer);
        this.showStatus('ready', 'Tuni respondio. Puedes volver a hablar.');
      }
    }
  }

  private detachMic(): void {
    if (this.currentMic) {
      this.currentMic.removeEventListener('click', this.onMicClick, { capture: true });
      this.currentMic.removeAttribute('data-tuni-voice-v2');
      this.currentMic = null;
    }
    this.currentInput = null;
    this.currentSend = null;
  }

  private clearSpeechTimers(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    if (this.voiceTimer) clearInterval(this.voiceTimer);
    this.stopTimer = undefined;
    this.waitingTimer = undefined;
    this.voiceTimer = undefined;
  }
}
