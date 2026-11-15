import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';

/**
 * Integracion aditiva: no reemplaza el chat, los controles de captura ni sus peticiones a la API.
 * El boton Escuchar usa la voz local Microsoft Sabina cuando esta instalada.
 * En una conversacion continua, solo activa una voz de reserva si aparece un error de TTS.
 */
@Component({
  selector: 'app-tuni-sabina-voice',
  standalone: true,
  template: '',
  styles: [':host { display: contents; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TuniSabinaVoiceComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly i18n = inject(LanguageService);
  private container: HTMLElement | null = null;
  private observer?: MutationObserver;
  private scheduled = false;
  private utterance: SpeechSynthesisUtterance | null = null;
  private speakingButton: HTMLButtonElement | null = null;
  private chunks: string[] = [];
  private index = 0;
  private generation = 0;
  private nextChunkTimer?: ReturnType<typeof setTimeout>;
  private fallbackText = '';
  private voices: SpeechSynthesisVoice[] = [];

  ngAfterViewInit(): void {
    this.container = this.host.nativeElement.parentElement;
    if (!this.container) return;
    this.container.addEventListener('click', this.interceptListen, true);
    this.observer = new MutationObserver(() => this.scheduleUpdate());
    this.observer.observe(this.container, { childList: true, subtree: true, characterData: true });
    if ('speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.addEventListener('voiceschanged', this.loadVoices);
    }
    this.scheduleUpdate();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.container?.removeEventListener('click', this.interceptListen, true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.removeEventListener('voiceschanged', this.loadVoices);
    }
    this.stopSpeech();
  }

  private readonly loadVoices = (): void => {
    if ('speechSynthesis' in window) this.voices = window.speechSynthesis.getVoices();
  };

  private get panel(): HTMLElement | null {
    return this.container?.querySelector<HTMLElement>('.chat-panel') ?? null;
  }

  private readonly interceptListen = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.panel?.contains(button)) return;
    // Nunca interceptar el microfono, enviar, cerrar ni los controles de voz continua.
    if (!button.closest('.chat-message, .chat-messages, [class*="message-bubble"], [class*="message-card"]')) return;
    const textLabel = [button.innerText, button.title, button.getAttribute('aria-label')].filter(Boolean).join(' ');
    const isListen = /(^|\s)(escuchar|reproducir voz|o[ií]r respuesta|listen|play audio|listen to response)(\s|$)/i.test(textLabel);
    if (!isListen && button !== this.speakingButton) return;
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    const text = this.messageForButton(button);
    if (!text && button !== this.speakingButton) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (button === this.speakingButton) {
      this.stopSpeech();
    } else {
      this.startSpeech(text, button);
    }
  };

  private messageForButton(button: HTMLButtonElement): string {
    const parent = button.closest<HTMLElement>('.chat-message, [class*="message-bubble"], [class*="message-card"]');
    if (!parent) return this.latestTuniText();
    const paragraphs = Array.from(parent.querySelectorAll<HTMLElement>('p, .message-text, .message-content'));
    let text = paragraphs.map(element => element.textContent ?? '').filter(Boolean).join(' ').trim();
    if (!text) {
      const clone = parent.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('button,svg,.message-author,small').forEach(node => node.remove());
      text = clone.textContent?.trim() ?? '';
    }
    return this.normalize(text);
  }

  private latestTuniText(): string {
    const panel = this.panel;
    if (!panel) return '';
    const messages = Array.from(panel.querySelectorAll<HTMLElement>(
      '.chat-message.from-tuni, .chat-message[data-role="assistant"], [data-role="assistant"], .tuni-msg-assistant',
    ));
    const last = messages.at(-1);
    if (!last) return '';
    const paragraphs = Array.from(last.querySelectorAll<HTMLElement>('p'));
    return this.normalize((paragraphs.length ? paragraphs.map(p => p.textContent ?? '').join(' ') : last.textContent ?? '').trim());
  }

  private normalize(text: string): string {
    return text.replace(/\bTuni\s*[\- ]?\s*Wars\b/gi, 'TunariGuard').replace(/\s+/g, ' ').trim();
  }

  private preferredVoice(): SpeechSynthesisVoice | null {
    this.loadVoices();
    const list = this.voices;
    if (this.i18n.language() === 'en') {
      return list.find(v => /^en[-_]/i.test(v.lang) && /female|aria|jenny|zira|samantha/i.test(v.name))
        ?? list.find(v => /^en[-_]/i.test(v.lang)) ?? null;
    }
    return list.find(v => /microsoft\s+sabina/i.test(v.name) && /^es[-_]?mx$/i.test(v.lang))
      ?? list.find(v => /microsoft\s+sabina/i.test(v.name))
      ?? list.find(v => /^es[-_]?mx$/i.test(v.lang) && /female|femenin|mujer|sabina/i.test(v.name))
      ?? list.find(v => /^es[-_]?mx$/i.test(v.lang))
      ?? list.find(v => /^es(?:[-_]|$)/i.test(v.lang))
      ?? null;
  }

  private splitText(text: string): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let current = '';
    for (const word of words) {
      if (current && (current.length + word.length + 1) > 165) {
        chunks.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private startSpeech(text: string, button: HTMLButtonElement | null): void {
    const normalized = this.normalize(text);
    if (!normalized || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    this.stopSpeech();
    this.chunks = this.splitText(normalized);
    this.index = 0;
    this.speakingButton = button;
    if (button) button.setAttribute('data-tuni-sabina-playing', 'true');
    this.sayNext(this.generation);
  }

  private sayNext(token: number): void {
    if (token !== this.generation) return;
    const text = this.chunks[this.index++];
    if (!text) { this.finishSpeech(); return; }
    const voice = this.preferredVoice();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang ?? (this.i18n.language() === 'en' ? 'en-US' : 'es-MX');
    if (voice) utterance.voice = voice;
    // Levemente juvenil, sin sobreacelerar ni distorsionar la pronunciacion.
    utterance.pitch = 1.30;
    utterance.rate = 0.96;
    utterance.volume = 1;
    this.utterance = utterance;
    utterance.onend = () => {
      if (token !== this.generation) return;
      this.nextChunkTimer = setTimeout(() => this.sayNext(token), 35);
    };
    utterance.onerror = () => {
      if (token !== this.generation) return;
      this.finishSpeech();
    };
    try { window.speechSynthesis.speak(utterance); }
    catch { this.finishSpeech(); }
  }

  private stopSpeech(): void {
    this.generation++;
    if (this.nextChunkTimer !== undefined) clearTimeout(this.nextChunkTimer);
    this.nextChunkTimer = undefined;
    const button = this.speakingButton;
    if (button) button.removeAttribute('data-tuni-sabina-playing');
    this.speakingButton = null;
    this.utterance = null;
    this.chunks = [];
    this.index = 0;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  private finishSpeech(): void {
    const button = this.speakingButton;
    if (button) button.removeAttribute('data-tuni-sabina-playing');
    this.speakingButton = null;
    this.utterance = null;
    this.chunks = [];
    this.index = 0;
  }

  private scheduleUpdate(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.updateUi();
    });
  }

  private updateUi(): void {
    const panel = this.panel;
    if (!panel) {
        this.fallbackText = '';
      if (this.utterance) this.stopSpeech();
      return;
    }
    const own = Array.from(panel.querySelectorAll<HTMLElement>(
      '.chat-message.from-tuni, .chat-message[data-role="assistant"], [data-role="assistant"], .tuni-msg-assistant',
    ));
    for (const element of own) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        if (node.parentElement?.closest('button,textarea,input,[contenteditable="true"]')) {
          node = walker.nextNode();
          continue;
        }
        const value = node.nodeValue ?? '';
        const corrected = value.replace(/\bTuni\s*[\- ]?\s*Wars\b/gi, 'TunariGuard');
        if (corrected !== value) node.nodeValue = corrected;
        node = walker.nextNode();
      }
    }

    // Respaldo solo para cuando falla la sintesis automatica del modo continuo.
    // No iniciar voz sin un error explicito: evitamos duplicar audios de la API.
    const errorCandidates = Array.from(panel.querySelectorAll<HTMLElement>('p,span,small,div'));
    const errorNode = errorCandidates.find(el => el.children.length === 0 &&
      /no se pudo generar la voz de tuni|could not generate tuni.s voice/i.test(el.textContent ?? ''));
    if (!errorNode) return;
    const continuous = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).some(button =>
      /desactivar\s*(voz|conversaci[oó]n)?|detener\s*conversaci[oó]n|stop voice conversation/i.test(
        [button.innerText, button.getAttribute('aria-label'), button.title].join(' '),
      ));
    const lastText = this.latestTuniText();
    if (continuous && lastText && lastText !== this.fallbackText && !this.utterance && 'speechSynthesis' in window) {
      this.fallbackText = lastText;
      this.startSpeech(lastText, null);
      errorNode.textContent = this.i18n.text('Audio remoto no disponible. Tuni está usando la voz local de Sabina.');
    }
  }
}
