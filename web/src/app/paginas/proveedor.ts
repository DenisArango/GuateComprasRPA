import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { FechaMediaPipe, formatoEntero, legible, LegiblePipe, QuetzalesPipe, quetzalesCompactos } from '../core/formato';
import type { PerfilProveedor } from '../core/modelos';
import { Icono } from '../compartido/icono';
import { TablaProcesos } from '../compartido/procesos';

/** CU-09 · perfil de un proveedor (RF-OCDS-04): cuánto ha ganado, con quién y cómo ha cambiado en el tiempo. */
@Component({
  selector: 'vc-proveedor',
  imports: [RouterLink, Icono, TablaProcesos, FechaMediaPipe, QuetzalesPipe, LegiblePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="volver small muted" routerLink="/historial"><vc-icono nombre="flecha-izquierda" />Historial</a>

    @if (error()) {
      <div class="panel vacio" role="alert">{{ error() }}</div>
    } @else if (p(); as p) {
      <header class="encabezado">
        <p class="small muted">Proveedor@if (p.nit) { · <span class="mono">NIT {{ p.nit }}</span> }@if (p.tipo) { · {{ p.tipo | legible }} }</p>
        <h1>{{ p.nombre | legible: 'entidad' }}</h1>
        <p class="muted">{{ hallazgo() }}</p>
      </header>

      <section class="panel datos" aria-label="Totales">
        <div><p class="small muted">Adjudicado</p><p class="valor num">{{ p.totales.monto | quetzales }}</p></div>
        <div><p class="small muted">Procesos</p><p class="valor num">{{ entero(p.totales.procesos) }}</p></div>
        <div><p class="small muted">Entidades</p><p class="valor num">{{ entero(p.totales.entidades) }}</p></div>
        <div><p class="small muted">Con señales de riesgo</p><p class="valor num">{{ entero(p.totales.conIndicadores) }}</p>
          @if (p.totales.conIndicadores) { <a class="small" routerLink="/riesgos" [queryParams]="{ proveedor: p.nit ?? p.nombre }">Ver en banderas rojas</a> }
        </div>
      </section>

      <div class="rejilla">
        <section class="panel">
          <div class="panel-header"><h2>Monto adjudicado por año</h2></div>
          <div class="panel-body barras">
            @for (a of anios(); track a.anio) {
              <div class="fila-barra">
                <span class="num anio">{{ a.anio }}</span>
                <span class="pista"><span class="relleno" [style.width.%]="a.ancho"></span></span>
                <span class="num monto">{{ compacto(a.monto) }}</span>
                <span class="small faint num procesos">{{ entero(a.procesos) }} proc.</span>
              </div>
            }
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><h2>Principales entidades</h2></div>
          <ul class="entidades">
            @for (e of p.entidades; track e.entidad) {
              <li><span class="nombre">{{ e.entidad | legible: 'entidad' }}</span><span class="num">{{ compacto(e.monto) }}</span><span class="small faint num">{{ entero(e.procesos) }}</span></li>
            }
          </ul>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header"><h2>Procesos más recientes</h2><span class="small muted">{{ p.totales.desde | fechaMedia }} a {{ p.totales.hasta | fechaMedia }}</span></div>
        <vc-tabla-procesos [procesos]="p.procesos" />
      </section>
    } @else {
      <div class="cargando"><div class="esqueleto" style="width: 50%; height: 28px"></div><div class="esqueleto" style="height: 88px"></div><div class="esqueleto" style="height: 240px"></div></div>
    }
  `,
  styles: `
    .volver { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; margin-bottom: 16px; }
    .encabezado { display: grid; gap: 4px; margin-bottom: 20px; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: var(--gap); }
    .datos > div { padding: 16px var(--card-pad); display: grid; gap: 2px; align-content: start; }
    .datos > div + div { border-left: 1px solid var(--border); }
    .valor { font-size: 20px; line-height: 28px; font-weight: 500; }
    .rejilla { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--gap); margin-bottom: var(--gap); align-items: start; }
    .barras { display: grid; gap: 10px; }
    .fila-barra { display: grid; grid-template-columns: 40px minmax(0, 1fr) 72px 64px; align-items: center; gap: 10px; }
    .pista { height: 8px; border-radius: 4px; background: var(--accent-track); overflow: hidden; }
    .relleno { display: block; height: 100%; border-radius: 4px; background: var(--accent); }
    .monto { text-align: right; font-weight: 500; }
    .procesos { text-align: right; }
    .entidades { list-style: none; margin: 0; padding: 0 var(--card-pad) 12px; }
    .entidades li { display: grid; grid-template-columns: minmax(0, 1fr) auto 40px; gap: 12px; padding: 8px 0; align-items: baseline; }
    .entidades li + li { border-top: 1px solid var(--rule); }
    .entidades .nombre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .entidades .small { text-align: right; }
    .cargando { display: grid; gap: 16px; }
    @media (max-width: 960px) { .rejilla { grid-template-columns: 1fr; } }
    @media (max-width: 720px) {
      .datos { grid-template-columns: 1fr 1fr; }
      .datos > div:nth-child(3) { border-left: 0; }
      .datos > div:nth-child(n + 3) { border-top: 1px solid var(--border); }
    }
  `,
})
export class ProveedorPagina {
  private readonly api = inject(ApiService);
  readonly id = input.required<string>();
  protected readonly p = signal<PerfilProveedor | null>(null);
  protected readonly error = signal('');
  protected readonly entero = formatoEntero;
  protected readonly compacto = quetzalesCompactos;

  protected readonly anios = computed(() => {
    const lista = this.p()?.porAnio ?? [];
    const max = Math.max(1, ...lista.map((a) => a.monto));
    return lista.map((a) => ({ ...a, ancho: (a.monto / max) * 100 }));
  });

  protected readonly hallazgo = computed(() => {
    const p = this.p();
    if (!p || !p.entidades.length) return 'Sin adjudicaciones en los datos disponibles.';
    const principal = p.entidades[0];
    const parte = p.totales.monto ? Math.round((principal.monto / p.totales.monto) * 100) : 0;
    return `El ${parte} % de lo que ha ganado viene de ${legible(principal.entidad, 'entidad')}.`;
  });

  constructor() {
    effect((limpiar) => {
      const id = Number(this.id());
      this.p.set(null);
      this.error.set('');
      const s = this.api.proveedor(id).subscribe({
        next: (p) => this.p.set(p),
        error: (e) => this.error.set(e?.status === 404 ? 'No encontramos ese proveedor.' : 'No pudimos cargar el proveedor.'),
      });
      limpiar(() => s.unsubscribe());
    });
  }
}
