import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  ArrowLeft, Bookmark, Building, CalendarClock, Check, ChevronRight, CircleCheck, Download, ExternalLink,
  Activity, FileText, Flag, History, LayoutDashboard, ListFilter, LogOut, Plus, Search, TriangleAlert, X,
} from 'lucide-static';

/** Íconos de Lucide (ISC), un solo set de contorno. Son SVG estáticos del paquete, no contenido del usuario. */
const ICONOS = {
  'flecha-izquierda': ArrowLeft, marcador: Bookmark, entidad: Building, calendario: CalendarClock, check: Check,
  chevron: ChevronRight, 'check-circulo': CircleCheck, descargar: Download, externo: ExternalLink, documento: FileText,
  panel: LayoutDashboard, lista: ListFilter, salir: LogOut, mas: Plus, buscar: Search, alerta: TriangleAlert, cerrar: X,
  historial: History, bandera: Flag, actividad: Activity,
} as const;

export type NombreIcono = keyof typeof ICONOS;

@Component({
  selector: 'vc-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.width.px]': 'tamano()', '[style.height.px]': 'tamano()', '[innerHTML]': 'svg()' },
  template: '',
  styles: [':host { display: inline-flex; flex: none; } :host ::ng-deep svg { width: 100%; height: 100%; stroke-width: 1.6; }'],
})
export class Icono {
  private readonly sanitizer = inject(DomSanitizer);
  readonly nombre = input.required<NombreIcono>();
  readonly tamano = input(16);
  protected readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONOS[this.nombre()]));
}
