import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api';
import { diasHasta, FechaCortaPipe, FechaLargaPipe, formatoEntero, ModalidadPipe, QuetzalesPipe, LegiblePipe } from '../core/formato';
import type { Oportunidad, Panel } from '../core/modelos';
import { SesionService } from '../core/sesion';
import { Icono } from '../compartido/icono';

/**
 * Pregunta de la pantalla: ¿qué concursos vale la pena preparar antes de que cierren?
 * Lo más grande es la lista de prioridades; el hallazgo va bajo el título.
 */
@Component({
  selector: 'vc-panel',
  imports: [RouterLink, Icono, QuetzalesPipe, FechaCortaPipe, FechaLargaPipe, ModalidadPipe, LegiblePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titulo">
      <div>
        <h1>Panel</h1>
        @if (panel(); as p) {
          <p class="hallazgo">{{ hallazgo() }}</p>
        } @else if (!error()) {
          <div class="esqueleto" style="width: 360px; margin-top: 8px"></div>
        }
      </div>
      <a class="btn btn-primary" routerLink="/oportunidades">Revisar oportunidades<vc-icono nombre="chevron" /></a>
    </header>

    @if (error()) {
      <div class="panel vacio" role="alert">No pudimos cargar el panel: {{ error() }}. Revisa que la API esté encendida y recarga la página.</div>
    } @else {
      <section class="panel kpis" aria-label="Resumen">
        @for (k of kpis(); track k.etiqueta) {
          <div class="kpi">
            <p class="small muted">{{ k.etiqueta }}</p>
            <p class="valor num">{{ k.valor }}</p>
            <p class="small faint">{{ k.nota }}</p>
          </div>
        }
      </section>

      <div class="rejilla">
        <section class="panel prioridades">
          <div class="panel-header">
            <h2>Prioridades por fecha de cierre</h2>
            <a class="small" routerLink="/oportunidades">Ver las {{ panel()?.oportunidades ?? 0 }}</a>
          </div>
          @if (prioridades().length) {
            <ul>
              @for (o of prioridades(); track o.nog) {
                <li>
                  <a [routerLink]="['/concursos', o.nog]">
                    <span class="cierre" [class.urgente]="urgente(o)">
                      <span class="dias num">{{ diasTexto(o) }}</span>
                      <span class="small faint">{{ o.fechaCierre | fechaCorta }}</span>
                    </span>
                    <span class="texto">
                      <span class="titulo-concurso">{{ o.titulo | legible }}</span>
                      <span class="small muted">{{ o.entidad | legible: 'entidad' }} · {{ o.modalidad | modalidad }}@if (o.monto) { · <span class="num">{{ o.monto | quetzales }}</span> }</span>
                    </span>
                    <span class="puntaje">
                      <span class="num">{{ o.puntaje }}</span>
                      <span class="barra" [class.preliminar]="o.etapa === 'PRELIMINAR'"><span [style.width.%]="o.puntaje"></span></span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          } @else if (panel()) {
            <p class="vacio">No hay oportunidades abiertas para este perfil. Revisa las palabras clave y categorías del perfil de empresa.</p>
          } @else {
            <div class="panel-body cargando">@for (i of [1, 2, 3, 4]; track i) { <div class="esqueleto"></div> }</div>
          }
        </section>

        <div class="columna">
          <section class="panel">
            <div class="panel-header">
              <h2>Boletín del {{ (panel()?.embudo?.fechaBoletin ?? null) | fechaLarga }}</h2>
            </div>
            <div class="panel-body embudo">
              @for (e of embudo(); track e.etiqueta) {
                <div class="etapa">
                  <div class="fila-etapa"><span>{{ e.etiqueta }}</span><span class="num">{{ e.valorTexto }}</span></div>
                  <div class="barra"><span [style.width.%]="e.ancho"></span></div>
                </div>
              }
              <p class="small faint nota">Los concursos se preseleccionan con las palabras clave y categorías del perfil. Los documentos los descarga el robot atendido.</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header"><h2>Lectura con IA, últimos 30 días</h2></div>
            <div class="panel-body ia">
              <div><p class="small muted">Bases leídas</p><p class="num valor-chico">{{ panel()?.ia?.llamadas30Dias ?? '—' }}</p></div>
              <div><p class="small muted">Costo</p><p class="num valor-chico">{{ costoIa() }}</p></div>
              <p class="small faint nota">Presupuesto diario: US$ {{ panel()?.ia?.presupuestoDiarioUsd?.toFixed(2) }}</p>
            </div>
          </section>
        </div>
      </div>
    }
  `,
  styles: `
    .titulo { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    .hallazgo { margin-top: 4px; color: var(--muted); font-size: 15px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: var(--gap); }
    .kpi { padding: 16px var(--card-pad); display: grid; gap: 2px; }
    .kpi + .kpi { border-left: 1px solid var(--border); }
    .valor { font-size: var(--fs-kpi); line-height: 34px; font-weight: 500; }
    /* 2/3 + 1/3 del lienzo; el gap es el mismo de las tarjetas */
    .rejilla { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: var(--gap); align-items: start; }
    .columna { display: grid; gap: var(--gap); }
    ul { list-style: none; margin: 0; padding: 0 8px 8px; }
    li a {
      display: grid; grid-template-columns: 92px minmax(0, 1fr) 120px; align-items: center; gap: 16px;
      padding: 12px; border-radius: var(--radius-control); text-decoration: none; color: inherit;
      transition: background-color var(--t-fast) var(--ease-out);
    }
    li + li a { box-shadow: 0 -1px 0 var(--rule); }
    li a:hover { background: #fafbf9; color: inherit; }
    .cierre { display: grid; }
    .dias { font-weight: 600; }
    .cierre.urgente .dias { color: var(--negative); }
    .texto { display: grid; gap: 2px; min-width: 0; }
    .titulo-concurso { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .texto .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .puntaje { display: grid; grid-template-columns: 28px 1fr; align-items: center; gap: 8px; text-align: right; font-weight: 500; }
    .embudo { display: grid; gap: 14px; }
    .fila-etapa { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .fila-etapa .num { font-weight: 500; }
    .nota { margin-top: 4px; }
    .ia { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ia .nota { grid-column: 1 / -1; margin: 0; }
    .valor-chico { font-size: 20px; line-height: 28px; font-weight: 500; }
    .cargando { display: grid; gap: 14px; }

    @media (max-width: 1100px) { .rejilla { grid-template-columns: 1fr; } }
    @media (max-width: 720px) {
      .titulo { flex-direction: column; }
      .kpis { grid-template-columns: 1fr 1fr; }
      .kpi:nth-child(3) { border-left: 0; }
      .kpi:nth-child(n + 3) { border-top: 1px solid var(--border); }
      li a { grid-template-columns: 72px minmax(0, 1fr); }
      .puntaje { grid-column: 2; }
    }
  `,
})
export class PanelPagina {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  protected readonly panel = signal<Panel | null>(null);
  protected readonly oportunidades = signal<Oportunidad[]>([]);
  protected readonly error = signal('');

  /** Las 6 que cierran antes; a igual fecha, la de mayor compatibilidad. */
  protected readonly prioridades = computed(() =>
    [...this.oportunidades()]
      .sort((a, b) => (diasHasta(a.fechaCierre) ?? 999) - (diasHasta(b.fechaCierre) ?? 999) || b.puntaje - a.puntaje)
      .slice(0, 6),
  );

  protected readonly hallazgo = computed(() => {
    const p = this.panel();
    if (!p) return '';
    if (p.oportunidades === 0) return 'No hay oportunidades abiertas para este perfil.';
    const hoy = this.oportunidades().filter((o) => diasHasta(o.fechaCierre) === 0).length;
    return `${p.cierranEstaSemana} de ${p.oportunidades} oportunidades cierran en los próximos 7 días` +
      (hoy ? `; ${hoy} cierra${hoy === 1 ? '' : 'n'} hoy.` : '.');
  });

  protected readonly kpis = computed(() => {
    const p = this.panel();
    const v = (n: number | undefined) => (n === undefined ? '—' : formatoEntero(n));
    return [
      { etiqueta: 'Oportunidades abiertas', valor: v(p?.oportunidades), nota: 'sobre el umbral del perfil' },
      { etiqueta: 'Cierran en 7 días', valor: v(p?.cierranEstaSemana), nota: 'de las abiertas' },
      { etiqueta: 'En seguimiento', valor: v(p?.siguiendo), nota: 'seguir o participaré' },
      { etiqueta: 'Fichas en revisión', valor: v(p?.enRevision), nota: 'esperan validación humana' },
    ];
  });

  /** Embudo del último boletín: ancho relativo a lo recibido. */
  protected readonly embudo = computed(() => {
    const e = this.panel()?.embudo;
    if (!e) return [];
    const base = Math.max(e.recibidos, 1);
    return [
      { etiqueta: 'Publicados', valor: e.recibidos },
      { etiqueta: 'Preseleccionados para el perfil', valor: e.preseleccionados },
      { etiqueta: 'Con documentos capturados', valor: e.capturados },
      { etiqueta: 'Con ficha de la IA', valor: e.analizados },
    ].map((x) => ({ ...x, valorTexto: formatoEntero(x.valor), ancho: (x.valor / base) * 100 }));
  });

  protected readonly costoIa = computed(() => {
    const g = this.panel()?.ia.gasto30DiasUsd;
    return g === undefined ? '—' : `US$ ${g.toFixed(2)}`;
  });

  constructor() {
    effect(() => {
      const perfil = this.sesion.perfilActivo();
      if (!perfil) return;
      this.panel.set(null);
      forkJoin([this.api.panel(perfil.id), this.api.oportunidades(perfil.id, 'abiertas')]).subscribe({
        next: ([panel, oportunidades]) => {
          this.panel.set(panel);
          this.oportunidades.set(oportunidades);
        },
        error: (e) => this.error.set(e?.error?.error ?? 'error de conexión'),
      });
    });
  }

  protected diasTexto(o: Oportunidad) {
    const d = diasHasta(o.fechaCierre);
    return d === null ? '—' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `${d} días`;
  }

  protected urgente(o: Oportunidad) {
    const d = diasHasta(o.fechaCierre);
    return d !== null && d <= 1;
  }
}
