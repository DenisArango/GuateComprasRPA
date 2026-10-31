import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { FechaMediaPipe, LegiblePipe, ModalidadPipe, QuetzalesPipe } from '../core/formato';
import type { ProcesoRiesgo } from '../core/modelos';
import { Icono } from '../compartido/icono';
import { AvisoRiesgo } from '../compartido/procesos';

/** CU-10, paso 4 · un proceso del histórico con la evidencia que activó cada indicador. */
@Component({
  selector: 'vc-proceso-riesgo',
  imports: [RouterLink, Icono, AvisoRiesgo, FechaMediaPipe, QuetzalesPipe, LegiblePipe, ModalidadPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="volver small muted" routerLink="/riesgos"><vc-icono nombre="flecha-izquierda" />Banderas rojas</a>

    @if (error()) {
      <div class="panel vacio" role="alert">{{ error() }}</div>
    } @else if (p(); as p) {
      <header class="encabezado">
        <div class="titulos">
          <p class="small muted">@if (p.nog) { <span class="mono">NOG {{ p.nog }}</span> · }{{ p.modalidad | modalidad }} · {{ p.estado }}</p>
          <h1>{{ p.titulo | legible }}</h1>
          <p class="muted">{{ p.entidad | legible: 'entidad' }}</p>
        </div>
        @if (p.urlGuatecompras) {
          <a class="btn" [href]="p.urlGuatecompras" target="_blank" rel="noopener">Ver en Guatecompras<vc-icono nombre="externo" /></a>
        }
      </header>

      <section class="panel datos" aria-label="Datos del proceso">
        <div><p class="small muted">Publicado</p><p class="valor">{{ p.fechaPublicacion | fechaMedia }}</p></div>
        <div><p class="small muted">Plazo para ofertar</p><p class="valor num">{{ plazo() }}</p></div>
        <div><p class="small muted">Ofertas recibidas</p><p class="valor num">{{ p.numeroOfertas ?? '—' }}</p></div>
        <div><p class="small muted">Puntaje de riesgo</p><p class="valor num">{{ p.puntajeRiesgo }} <span class="small muted">de 100</span></p></div>
      </section>

      <vc-aviso-riesgo />

      <section class="panel">
        <div class="panel-header"><h2>Señales activadas</h2><span class="small muted">{{ p.indicadores.length }} de 6 indicadores</span></div>
        @if (p.indicadores.length) {
          <ul class="indicadores">
            @for (i of p.indicadores; track i.codigo) {
              <li>
                <div class="cabecera"><span class="pill aviso">{{ i.codigo }}</span><h3>{{ i.nombre }}</h3><span class="small faint">peso {{ i.peso }}</span></div>
                <p class="evidencia">{{ i.evidencia }}</p>
                <p class="small muted">{{ i.explicacion }}</p>
              </li>
            }
          </ul>
        } @else {
          <p class="vacio">Este proceso no activa ningún indicador.</p>
        }
      </section>

      <section class="panel">
        <div class="panel-header"><h2>Adjudicaciones</h2></div>
        @if (p.adjudicaciones.length) {
          <div class="desplazable">
            <table class="tabla">
              <thead><tr><th scope="col">Proveedor</th><th scope="col">NIT</th><th scope="col">Fecha</th><th scope="col" class="num">Monto</th></tr></thead>
              <tbody>
                @for (a of p.adjudicaciones; track $index) {
                  <tr>
                    <td><a [routerLink]="['/proveedores', a.proveedorId]">{{ a.proveedor | legible: 'entidad' }}</a>@if (a.estado === 'cancelled') { <span class="pill">Cancelada</span> }</td>
                    <td class="mono">{{ a.nit ?? '—' }}</td>
                    <td class="num">{{ a.fecha | fechaMedia }}</td>
                    <td class="num">{{ a.monto | quetzales }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="vacio">Sin adjudicaciones registradas.</p>
        }
      </section>
    } @else {
      <div class="cargando"><div class="esqueleto" style="width: 50%; height: 28px"></div><div class="esqueleto" style="height: 88px"></div><div class="esqueleto" style="height: 200px"></div></div>
    }
  `,
  styles: `
    .volver { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; margin-bottom: 16px; }
    .encabezado { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
    .titulos { display: grid; gap: 4px; max-width: 80ch; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: var(--gap); }
    .datos > div { padding: 16px var(--card-pad); display: grid; gap: 2px; }
    .datos > div + div { border-left: 1px solid var(--border); }
    .valor { font-size: 18px; line-height: 26px; font-weight: 500; }
    vc-aviso-riesgo { margin-bottom: var(--gap); }
    section + section { margin-top: var(--gap); }
    .indicadores { list-style: none; margin: 0; padding: 0 var(--card-pad) 8px; }
    .indicadores li { padding: 14px 0; display: grid; gap: 6px; }
    .indicadores li + li { border-top: 1px solid var(--rule); }
    .cabecera { display: flex; align-items: center; gap: 10px; }
    .cabecera .small { margin-left: auto; }
    .evidencia { font-size: 15px; line-height: 22px; max-width: 80ch; }
    .tabla a { text-decoration: none; margin-right: 8px; }
    .tabla a:hover { text-decoration: underline; }
    .cargando { display: grid; gap: 16px; }
    @media (max-width: 720px) {
      .encabezado { flex-direction: column; }
      .datos { grid-template-columns: 1fr 1fr; }
      .datos > div:nth-child(3) { border-left: 0; }
      .datos > div:nth-child(n + 3) { border-top: 1px solid var(--border); }
    }
  `,
})
export class ProcesoRiesgoPagina {
  private readonly api = inject(ApiService);
  readonly ocid = input.required<string>();
  protected readonly p = signal<ProcesoRiesgo | null>(null);
  protected readonly error = signal('');

  protected readonly plazo = computed(() => {
    const p = this.p();
    if (!p?.inicioOfertas || !p.finOfertas) return '—';
    const dias = (new Date(p.finOfertas).getTime() - new Date(p.inicioOfertas).getTime()) / 86_400_000;
    return dias < 1 ? `${Math.round(dias * 24)} horas` : `${dias.toFixed(1).replace('.0', '')} días`;
  });

  constructor() {
    effect((limpiar) => {
      const ocid = this.ocid();
      this.p.set(null);
      this.error.set('');
      const s = this.api.procesoRiesgo(ocid).subscribe({
        next: (p) => this.p.set(p),
        error: (e) => this.error.set(e?.status === 404 ? 'No encontramos ese proceso en el histórico.' : 'No pudimos cargar el proceso.'),
      });
      limpiar(() => s.unsubscribe());
    });
  }
}
