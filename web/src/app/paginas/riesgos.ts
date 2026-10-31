import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api';
import { formatoEntero, LegiblePipe, quetzalesCompactos } from '../core/formato';
import type { FiltrosHistorial, RankingRiesgos, TableroRiesgos } from '../core/modelos';
import { Filtros } from '../compartido/filtros';
import { AvisoRiesgo, Paginacion, TablaProcesos } from '../compartido/procesos';

/**
 * CU-10 · ¿Qué procesos ameritan una segunda mirada? (RF-RIE-01 a 04, RF-WEB-07)
 * Lo primero es el aviso: un indicador es una señal, no una acusación.
 */
@Component({
  selector: 'vc-riesgos',
  imports: [RouterLink, Filtros, TablaProcesos, Paginacion, AvisoRiesgo, LegiblePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titulo">
      <h1>Banderas rojas</h1>
      <p class="muted">Indicadores de la metodología de Open Contracting Partnership, calculados sobre los procesos adjudicados del histórico.</p>
    </header>

    <vc-aviso-riesgo />

    @if (tablero(); as t) {
      <section class="panel indicadores" aria-label="Indicadores">
        @for (i of t.indicadores; track i.codigo) {
          <button type="button" class="indicador" [attr.aria-pressed]="filtros().indicador === i.codigo" (click)="alternar(i.codigo)" [title]="i.explicacion">
            <span class="small muted"><span class="mono">{{ i.codigo }}</span> · peso {{ i.peso }}</span>
            <span class="nombre">{{ i.nombre }}</span>
            <span class="num valor">{{ entero(i.activados) }}</span>
          </button>
        }
      </section>
      @if (indicadorActivo(); as i) {
        <p class="explicacion"><strong>{{ i.nombre }}.</strong> {{ i.explicacion }}</p>
      }
    }

    <vc-filtros [conProveedor]="true" (buscar)="filtrar($event)" />

    <div class="rejilla">
      <section class="panel">
        <div class="panel-header">
          <h2>Procesos con señales</h2>
          <span class="small muted">Ordenados por puntaje compuesto (0 a 100)</span>
        </div>
        @if (error()) {
          <p class="vacio" role="alert">No pudimos cargar los indicadores: {{ error() }}.</p>
        } @else if (tablero(); as t) {
          @if (t.procesos.length) {
            <vc-tabla-procesos [procesos]="t.procesos" />
            <vc-paginacion [pagina]="t.pagina" [porPagina]="t.porPagina" [total]="t.total" (cambiar)="irA($event)" />
          } @else {
            <p class="vacio">Ningún proceso con estos filtros activa indicadores.</p>
          }
        } @else {
          <div class="cargando">@for (i of [1, 2, 3, 4, 5]; track i) { <div class="esqueleto"></div> }</div>
        }
      </section>

      <aside class="lateral">
        <section class="panel">
          <div class="panel-header"><h2>Entidades</h2><span class="small muted">procesos con señales</span></div>
          @if (ranking(); as r) {
            <ol class="ranking">
              @for (e of r.entidades; track e.nombre) {
                <li>
                  <button type="button" class="enlace" (click)="porEntidad(e.nombre)">{{ e.nombre | legible: 'entidad' }}</button>
                  <span class="num">{{ entero(e.conIndicadores) }}</span>
                  <span class="small faint num">de {{ entero(e.procesos) }}</span>
                </li>
              } @empty { <li class="faint">Sin datos</li> }
            </ol>
          }
        </section>
        <section class="panel">
          <div class="panel-header"><h2>Proveedores</h2><span class="small muted">procesos con señales</span></div>
          @if (ranking(); as r) {
            <ol class="ranking">
              @for (p of r.proveedores; track p.id) {
                <li>
                  <a [routerLink]="['/proveedores', p.id]">{{ p.nombre | legible: 'entidad' }}</a>
                  <span class="num">{{ entero(p.conIndicadores) }}</span>
                  <span class="small faint num">{{ compacto(p.monto) }}</span>
                </li>
              } @empty { <li class="faint">Sin datos</li> }
            </ol>
          }
        </section>
        <p class="small faint nota">Un número alto puede deberse a que la entidad o el proveedor tiene muchos procesos. Compara con el total antes de sacar conclusiones.</p>
      </aside>
    </div>
  `,
  styles: `
    .titulo { display: grid; gap: 4px; margin-bottom: 16px; }
    vc-aviso-riesgo { margin-bottom: var(--gap); }
    .indicadores { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-bottom: 8px; overflow: hidden; }
    .indicador {
      display: grid; gap: 2px; align-content: start; padding: 14px 16px; border: 0; background: none; text-align: left;
      font: inherit; color: inherit; cursor: pointer; transition: background-color var(--t-fast) var(--ease-out);
    }
    .indicador + .indicador { border-left: 1px solid var(--border); }
    .indicador:hover { background: var(--raised); }
    .indicador[aria-pressed='true'] { background: var(--active); box-shadow: inset 0 -2px 0 var(--primary); }
    .indicador .nombre { font-weight: 500; line-height: 18px; min-height: 36px; }
    .indicador .valor { font-size: 20px; line-height: 28px; font-weight: 500; }
    .explicacion { margin: 0 0 var(--gap); color: var(--muted); max-width: 90ch; }
    vc-filtros { display: block; margin: var(--gap) 0; }
    .rejilla { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); }
    .lateral { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--gap); align-items: start; }
    .lateral .nota { grid-column: 1 / -1; margin-top: -4px; }
    .ranking { margin: 0; padding: 0 var(--card-pad) 12px; list-style: none; counter-reset: r; }
    .ranking li { display: grid; grid-template-columns: minmax(0, 1fr) auto 88px; gap: 8px; align-items: baseline; padding: 8px 0; }
    .ranking li + li { border-top: 1px solid var(--rule); }
    .ranking a, .enlace { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
    .ranking .num:first-of-type { font-weight: 500; }
    .ranking .small { text-align: right; }
    .enlace { border: 0; padding: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .enlace:hover { color: var(--accent); }
    .nota { max-width: 90ch; }
    .cargando { display: grid; gap: 18px; padding: var(--card-pad); }
    @media (max-width: 1200px) { .indicadores { grid-template-columns: repeat(3, minmax(0, 1fr)); } .indicador:nth-child(4) { border-left: 0; } .indicador:nth-child(n + 4) { border-top: 1px solid var(--border); } }
    @media (max-width: 960px) { .lateral { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 600px) {
      .indicadores { grid-template-columns: 1fr 1fr; }
      .indicador:nth-child(odd) { border-left: 0; }
      .indicador:nth-child(4) { border-left: 1px solid var(--border); }
      .indicador:nth-child(n + 3) { border-top: 1px solid var(--border); }
    }
  `,
})
export class RiesgosPagina {
  private readonly api = inject(ApiService);
  /** Filtro por proveedor desde el perfil de un proveedor (?proveedor=) */
  readonly proveedor = input<string>();

  protected readonly tablero = signal<TableroRiesgos | null>(null);
  protected readonly ranking = signal<RankingRiesgos | null>(null);
  protected readonly error = signal('');
  protected readonly filtros = signal<FiltrosHistorial>({ pagina: 1 });
  protected readonly entero = formatoEntero;
  protected readonly compacto = quetzalesCompactos;

  protected indicadorActivo() {
    const codigo = this.filtros().indicador;
    return codigo ? this.tablero()?.indicadores.find((i) => i.codigo === codigo) ?? null : null;
  }

  constructor() {
    effect(() => {
      const p = this.proveedor();
      if (p) this.filtros.set({ proveedor: p, pagina: 1 });
    });
    effect((limpiar) => {
      const f = this.filtros();
      this.error.set('');
      this.tablero.set(null);
      const s = forkJoin([this.api.riesgos(f), this.api.ranking(f)]).subscribe({
        next: ([t, r]) => { this.tablero.set(t); this.ranking.set(r); },
        error: (e) => this.error.set(e?.error?.error ?? 'error de conexión'),
      });
      limpiar(() => s.unsubscribe());
    });
  }

  protected filtrar(f: FiltrosHistorial) {
    this.filtros.update((actual) => ({ ...f, indicador: actual.indicador, pagina: 1 }));
  }

  protected alternar(codigo: string) {
    this.filtros.update((f) => ({ ...f, indicador: f.indicador === codigo ? undefined : codigo, pagina: 1 }));
  }

  protected porEntidad(nombre: string) {
    this.filtros.update((f) => ({ ...f, entidad: nombre, pagina: 1 }));
  }

  protected irA(pagina: number) {
    this.filtros.update((f) => ({ ...f, pagina }));
  }
}
