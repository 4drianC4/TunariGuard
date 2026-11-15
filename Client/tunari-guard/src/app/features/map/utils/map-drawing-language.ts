import L from 'leaflet';
import 'leaflet-draw';
import type { AppLanguage } from '../../../core/i18n/language.service';

const english = structuredClone(L.drawLocal);

export function setDrawingLanguage(language: AppLanguage): void {
  const labels = structuredClone(english);
  if (language === 'es') {
    const { draw, edit } = labels;
    Object.assign(draw.toolbar.actions, { title: 'Cancelar dibujo', text: 'Cancelar' });
    Object.assign(draw.toolbar.finish, { title: 'Terminar dibujo', text: 'Terminar' });
    Object.assign(draw.toolbar.undo, { title: 'Borrar el último punto', text: 'Borrar último punto' });
    Object.assign(draw.toolbar.buttons, { polygon: 'Dibujar un polígono', rectangle: 'Dibujar un rectángulo' });
    Object.assign(draw.handlers.polygon.tooltip, {
      start: 'Pulsa para comenzar el dibujo.',
      cont: 'Pulsa para continuar el dibujo.',
      end: 'Pulsa el primer punto para cerrar el polígono.',
    });
    draw.handlers.polyline.error = '<strong>Error:</strong> los bordes no pueden cruzarse.';
    draw.handlers.rectangle.tooltip.start = 'Pulsa y arrastra para dibujar un rectángulo.';
    draw.handlers.simpleshape.tooltip.end = 'Suelta el puntero para terminar.';
    Object.assign(edit.toolbar.actions.save, { title: 'Guardar cambios', text: 'Guardar' });
    Object.assign(edit.toolbar.actions.cancel, { title: 'Cancelar la edición y descartar cambios', text: 'Cancelar' });
    Object.assign(edit.toolbar.actions.clearAll, { title: 'Borrar todas las capas', text: 'Borrar todo' });
    Object.assign(edit.toolbar.buttons, {
      edit: 'Editar capas', editDisabled: 'No hay capas para editar',
      remove: 'Borrar capas', removeDisabled: 'No hay capas para borrar',
    });
    Object.assign(edit.handlers.edit.tooltip, {
      text: 'Arrastra los puntos de control para editar.',
      subtext: 'Pulsa Cancelar para deshacer los cambios.',
    });
    edit.handlers.remove.tooltip.text = 'Pulsa una figura para borrarla.';
  }
  Object.assign(L.drawLocal, labels);
}
