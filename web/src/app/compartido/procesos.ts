import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FechaMediaPipe, formatoEntero, LegiblePipe, ModalidadPipe, QuetzalesPipe } from '../core/formato';
import type { ProcesoHistorico } from '../core/modelos';
import { Icono } from './icono';

/** Aviso obligatorio en toda pantalla de riesgos (docs/10, RF-RIE-04). */
@Component({
  selector: 'vc-aviso-riesgo',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<vc-icono nombre="alerta" /><p>{{ texto() }}</p>`,
  styles: `
    :host {
      display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; border-radius: var(--radius-card);
      background: var(--pill-warning-bg); color: var(--pill-warning-ink); box-shadow: inset 0 0 0 1px var(--warning-line);
    }
    vc-icono { margin-top: 2px; }
    p { max-width: 90ch; }
  `,
})
export class AvisoRiesgo {
  readonly texto = input('Un indicador activado no implica irregularidad. Señala un patrón estadístico que puede tener explicaciones legítimas y que amerita revisión.');
}

/** Procesos del histórico OCDS: el título abre el detalle con su evidencia; los proveedores, su perfil. */
@Component({
  selector: 'vc-tabla-procesos',
  host: { '[class.compacta]': 'compacta()' },
  imports: [RouterLink, FechaMediaPipe, QuetzalesPipe, LegiblePipe, ModalidadPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="desplazable">
      <table class="tabla">
        <thead>
          <tr>
            <th scope="col">Publicado</th>
            <th scope="col">Proceso</th>
            <th scope="col" class="col-modalidad">Modalidad</th>
            <th scope="col">Adjudicado a</th>
            <th scope="col" class="num">Monto</th>
            <th scope="col" class="num col-ofertas">Ofertas</th>
            @if (conRiesgo()) { <th scope="col">Señales</th> }
          </tr>
        </thead>
        <tbody>
          @for (p of procesos(); track p.ocid) {
            <tr>
              <td class="sin-salto num muted">{{ p.fechaPublicacion | fechaMedia }}</td>
              <td class="proceso">
                <a [routerLink]="['/riesgos/procesos', p.ocid]">{{ p.titulo | legible }}</a>
                <span class="small muted">{{ p.entidad | legible: 'entidad' }}@if (p.nog) { · <span class="mono">NOG {{ p.nog }}</span> }@if (p.estado && p.estado !== 'Adjudicado') { · {{ p.estado }} }</span>
              </td>
              <td class="muted col-modalidad"><span class="modalidad" [title]="p.modalidad">{{ p.modalidad | modalidad }}</span></td>
              <td class="proveedores">
                @for (v of p.proveedores.slice(0, 2); track v.id) {
                  <a [routerLink]="['/proveedores', v.id]">{{ v.nombre | legible: 'entidad' }}</a>
                } @empty { <span class="faint">—</span> }
                @if (p.proveedores.length > 2) { <span class="small faint">y {{ p.proveedores.length - 2 }} más</span> }
              </td>
              <td class="num sin-salto">{{ p.monto | quetzales }}</td>
              <td class="num col-ofertas">{{ p.numeroOfertas ?? '—' }}</td>
              @if (conRiesgo()) {
                <td>
                  @if (p.indicadores.length) {
                    <span class="senales">
                      <span class="num puntaje">{{ p.puntajeRiesgo }}</span>
                      <span class="codigos small">{{ p.indicadores.join(' · ') }}</span>
                    </span>
                  } @else { <span class="faint small">Ninguna</span> }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    /* Compacta: para columnas angostas (detalle del concurso); el monto siempre visible */
    :host(.compacta) .tabla { min-width: 0; }
    :host(.compacta) .col-modalidad, :host(.compacta) .col-ofertas { display: none; }
    :host(.compacta) .proceso { max-width: 300px; }
    :host(.compacta) .proveedores { max-width: 160px; }
    .tabla { min-width: 820px; }
    .proceso { max-width: 380px; }
    .proceso a { display: block; font-weight: 500; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .proceso .small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .proveedores { max-width: 200px; }
    .proveedores a { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
    .proveedores a:hover, .proceso a:hover { text-decoration: underline; }
    .sin-salto { white-space: nowrap; }
    .modalidad { display: block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .senales { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: baseline; gap: 6px; max-width: 150px; }
    .codigos { color: var(--pill-warning-ink); font-family: var(--mono); font-size: 11px; line-height: 15px; }
    .puntaje { font-weight: 600; min-width: 24px; }
    @media (max-width: 1200px) { .col-modalidad { display: none; } }
    @media (max-width: 960px) { .col-ofertas { display: none; } }
  `,
})
export class TablaProcesos {
  readonly procesos = input.required<ProcesoHistorico[]>();
  readonly conRiesgo = input(true);
  readonly compacta = input(false);
}

/** "1–25 de 342,057" con anterior y siguiente. */
@Component({
  selector: 'vc-paginacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="small muted num">{{ rango() }}</span>
    <div class="botones">
      <button class="btn" type="button" [disabled]="pagina() <= 1" (click)="cambiar.emit(pagina() - 1)">Anterior</button>
      <button class="btn" type="button" [disabled]="pagina() * porPagina() >= total()" (click)="cambiar.emit(pagina() + 1)">Siguiente</button>
    </div>
  `,
  styles: `
    :host { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--rule); }
    .botones { display: flex; gap: 6px; }
  `,
})
export class Paginacion {
  readonly pagina = input.required<number>();
  readonly porPagina = input.required<number>();
  readonly total = input.required<number>();
  readonly cambiar = output<number>();
  protected readonly rango = computed(() => {
    if (!this.total()) return 'Sin resultados';
    const desde = (this.pagina() - 1) * this.porPagina() + 1;
    const hasta = Math.min(this.total(), this.pagina() * this.porPagina());
    return `${formatoEntero(desde)}–${formatoEntero(hasta)} de ${formatoEntero(this.total())}`;
  });
}
