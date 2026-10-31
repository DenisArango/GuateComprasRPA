import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FiltrosHistorial } from '../core/modelos';
import { Icono } from './icono';

/** Modalidades más frecuentes en OCDS; se filtran por prefijo. */
const MODALIDADES = [
  { valor: 'Compra Directa', texto: 'Compra directa' },
  { valor: 'Cotización', texto: 'Cotización' },
  { valor: 'Licitación Pública', texto: 'Licitación pública' },
  { valor: 'Adquisición Directa por Ausencia de Oferta', texto: 'Adquisición directa por ausencia de oferta' },
  { valor: 'Procedimientos regulados por el artículo 54', texto: 'Artículo 54 (entidades no gubernamentales)' },
  { valor: 'Procedimientos Regulados por el artículo 44', texto: 'Casos de excepción (artículo 44)' },
];

/** Filtros del historial y del tablero de riesgos (CU-09, CU-10). Se aplican al enviar el formulario. */
@Component({
  selector: 'vc-filtros',
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="panel filtros" (ngSubmit)="aplicar()" role="search">
      @if (conTexto()) {
        <div class="campo ancho">
          <label for="f-buscar">Palabra clave o NOG</label>
          <input id="f-buscar" name="buscar" class="input" type="search" [(ngModel)]="f.buscar" placeholder="Ej.: guantes de nitrilo" autocomplete="off" />
        </div>
      }
      <div class="campo">
        <label for="f-entidad">Entidad</label>
        <input id="f-entidad" name="entidad" class="input" [(ngModel)]="f.entidad" placeholder="Ej.: IGSS" autocomplete="off" />
      </div>
      @if (conProveedor()) {
        <div class="campo">
          <label for="f-proveedor">Proveedor o NIT</label>
          <input id="f-proveedor" name="proveedor" class="input" [(ngModel)]="f.proveedor" autocomplete="off" spellcheck="false" />
        </div>
      }
      <div class="campo">
        <label for="f-modalidad">Modalidad</label>
        <select id="f-modalidad" name="modalidad" class="input" [(ngModel)]="f.modalidad">
          <option value="">Todas</option>
          @for (m of modalidades; track m.valor) { <option [value]="m.valor">{{ m.texto }}</option> }
        </select>
      </div>
      <div class="campo fecha">
        <label for="f-desde">Desde</label>
        <input id="f-desde" name="desde" class="input" type="date" [(ngModel)]="f.desde" />
      </div>
      <div class="campo fecha">
        <label for="f-hasta">Hasta</label>
        <input id="f-hasta" name="hasta" class="input" type="date" [(ngModel)]="f.hasta" />
      </div>
      @if (conAdjudicados()) {
        <label class="casilla"><input type="checkbox" name="adjudicados" [(ngModel)]="soloAdjudicados" />Solo adjudicados</label>
      }
      <div class="acciones">
        <button class="btn btn-primary" type="submit"><vc-icono nombre="buscar" />Buscar</button>
        <button class="btn btn-ghost" type="button" (click)="limpiar()">Limpiar</button>
      </div>
    </form>
  `,
  styles: `
    .filtros { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 16px var(--card-pad); }
    .campo { flex: 1 1 160px; min-width: 0; }
    .campo.ancho { flex: 2 1 240px; }
    .campo.fecha { flex: 0 1 150px; }
    .acciones { display: flex; gap: 6px; }
    .casilla { display: inline-flex; align-items: center; gap: 8px; height: var(--control-height); font-size: 13px; font-weight: 500; cursor: pointer; }
    .casilla input { width: 16px; height: 16px; accent-color: var(--accent); margin: 0; }
  `,
})
export class Filtros {
  readonly conTexto = input(true);
  readonly conProveedor = input(true);
  readonly conAdjudicados = input(false);
  readonly buscar = output<FiltrosHistorial>();
  protected readonly modalidades = MODALIDADES;
  protected f: FiltrosHistorial = { modalidad: '' };
  protected soloAdjudicados = true;

  protected aplicar() {
    this.buscar.emit({ ...this.f, ...(this.conAdjudicados() ? { adjudicados: this.soloAdjudicados ? 'true' : 'false' } : {}), pagina: 1 });
  }

  protected limpiar() {
    this.f = { modalidad: '' };
    this.soloAdjudicados = true;
    this.aplicar();
  }
}
