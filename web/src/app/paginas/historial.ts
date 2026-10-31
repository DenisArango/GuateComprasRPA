import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ApiService } from '../core/api';
import { FechaMediaPipe, formatoEntero } from '../core/formato';
import type { FiltrosHistorial, PaginaProcesos, ResumenHistorial } from '../core/modelos';
import { Filtros } from '../compartido/filtros';
import { Paginacion, TablaProcesos } from '../compartido/procesos';

/**
 * CU-09 · ¿Quién le ha vendido esto al Estado, a quién y a qué precio?
 * Procesos adjudicados de los datos abiertos OCDS (RF-WEB-06, RF-OCDS-03).
 */
@Component({
  selector: 'vc-historial',
  imports: [Filtros, TablaProcesos, Paginacion, FechaMediaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titulo">
      <h1>Historial de contrataciones</h1>
      @if (resumen(); as r) {
        <p class="muted">
          {{ entero(r.procesos) }} procesos de Guatecompras publicados entre el {{ r.desde | fechaMedia }} y el {{ r.hasta | fechaMedia }},
          con {{ entero(r.proveedores) }} proveedores. Sirve para ver quién ganó compras parecidas y a qué precio.
        </p>
      } @else {
        <div class="esqueleto" style="width: 420px; margin-top: 8px"></div>
      }
    </header>

    <vc-filtros [conAdjudicados]="true" (buscar)="filtrar($event)" />

    <section class="panel resultados">
      @if (error()) {
        <p class="vacio" role="alert">No pudimos consultar el historial: {{ error() }}.</p>
      } @else if (pagina(); as p) {
        @if (p.procesos.length) {
          <vc-tabla-procesos [procesos]="p.procesos" />
          <vc-paginacion [pagina]="p.pagina" [porPagina]="p.porPagina" [total]="p.total" (cambiar)="irA($event)" />
        } @else {
          <p class="vacio">Ningún proceso coincide con la búsqueda. Prueba con menos palabras o quita algún filtro.</p>
        }
      } @else {
        <div class="cargando">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="esqueleto"></div> }</div>
      }
    </section>

    @if (resumen(); as r) {
      <p class="small faint fuente">{{ r.fuente }}@if (r.ultimaCarga) { Última actualización: {{ r.ultimaCarga | fechaMedia }}. }</p>
    }
  `,
  styles: `
    .titulo { display: grid; gap: 4px; margin-bottom: 20px; }
    .titulo p { max-width: 80ch; }
    vc-filtros { display: block; margin-bottom: var(--gap); }
    .cargando { display: grid; gap: 18px; padding: var(--card-pad); }
    .fuente { margin-top: 12px; max-width: 90ch; }
  `,
})
export class HistorialPagina {
  private readonly api = inject(ApiService);
  protected readonly resumen = signal<ResumenHistorial | null>(null);
  protected readonly pagina = signal<PaginaProcesos | null>(null);
  protected readonly error = signal('');
  private readonly filtros = signal<FiltrosHistorial>({ pagina: 1 });
  protected readonly entero = formatoEntero;

  constructor() {
    this.api.resumenHistorial().subscribe({ next: (r) => this.resumen.set(r) });
    effect((limpiar) => {
      const f = this.filtros();
      this.pagina.set(null);
      this.error.set('');
      const s = this.api.historial(f).subscribe({
        next: (p) => this.pagina.set(p),
        error: (e) => this.error.set(e?.error?.error ?? 'error de conexión'),
      });
      limpiar(() => s.unsubscribe());
    });
  }

  protected filtrar(f: FiltrosHistorial) {
    this.filtros.set(f);
  }

  protected irA(pagina: number) {
    this.filtros.update((f) => ({ ...f, pagina }));
  }
}
