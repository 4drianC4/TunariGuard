import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type TuniEstado = 'bienvenida' | 'saludo' | 'alerta' | 'satelite' | 'ayuda';
type ChatItem = { role: 'tuni' | 'user'; text: string };

@Component({
  selector: 'app-mascot-assistant',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './mascot-assistant.component.html',
  styleUrl: './mascot-assistant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MascotAssistantComponent {
  readonly abierto = signal(false);
  readonly estado = signal<TuniEstado>('bienvenida');
  readonly movimiento = signal(true);
  readonly inclinacion = signal(0);

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

  alternar(): void { this.abierto.update(valor => !valor); }
  cerrar(): void { this.abierto.set(false); }
  elegir(estado: TuniEstado): void {
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
