import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api';
import type { Bitacora, Ejecucion } from '../core/modelos';
import { Icono } from '../compartido/icono';

const fechaHora = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' });

/**
 * Supervisión de los robots (CU-12) y captura manual de un NOG (CU-13). Solo administrador.
 * La bitácora sale de los trabajos de Orchestrator, completada con lo que cada trabajo produjo en la base.
 */
@Component({
  selector: 'vc-ejecuciones',
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titulo">
      <div>
        <h1>Ejecuciones de los robots</h1>
        <p class="muted">Trabajos de Orchestrator con lo que produjo cada uno. Meta del piloto: 95 % de éxito durante 7 días.</p>
      </div>
      <div class="acciones">
        <label class="sr-only" for="dias">Periodo</label>
        <select id="dias" class="input" [ngModel]="dias()" (ngModelChange)="dias.set(+$event)">
          <option [value]="1">Últimas 24 horas</option>
          <option [value]="7">Últimos 7 días</option>
          <option [value]="30">Últimos 30 días</option>
        </select>
        <button class="btn" type="button" (click)="cargar()" [disabled]="cargando()">{{ cargando() ? 'Actualizando…' : 'Actualizar' }}</button>
      </div>
    </header>

    <section class="panel manual">
      <div class="panel-header"><h2>Capturar un NOG</h2></div>
      <div class="panel-body">
        <p class="muted small">Para un concurso que no vino en el boletín. Entra a la cola de VC.Concurso con prioridad alta; al capturarlo, sigue el mismo camino: documentos, ficha con IA y avisos.</p>
        <form class="fila" (submit)="capturar($event)">
          <label class="sr-only" for="nog">NOG</label>
          <input id="nog" class="input num" name="nog" placeholder="Ej.: 32557469" inputmode="numeric" autocomplete="off" spellcheck="false" [(ngModel)]="nog" />
          <button class="btn btn-primary" type="submit" [disabled]="!nogValido() || enviando()">{{ enviando() ? 'Encolando…' : 'Capturar' }}</button>
        </form>
      </div>
    </section>

    @if (datos(); as d) {
      @if (d.error) { <div class="panel aviso-error" role="alert">No se pudo leer Orchestrator: {{ d.error }}. Se muestra lo último guardado.</div> }

      <div class="indicadores">
        <div class="panel kpi">
          <span class="small muted">Tasa de éxito</span>
          <strong class="num" [class.mal]="d.resumen.tasa !== null && d.resumen.tasa < 95">{{ d.resumen.tasa === null ? '—' : d.resumen.tasa + ' %' }}</strong>
        </div>
        <div class="panel kpi"><span class="small muted">Ejecuciones terminadas</span><strong class="num">{{ d.resumen.total }}</strong></div>
        <div class="panel kpi"><span class="small muted">Fallidas</span><strong class="num">{{ d.resumen.total - d.resumen.exitosas }}</strong></div>
        <div class="panel kpi"><span class="small muted">Costo de IA</span><strong class="num">US$ {{ costoIa().toFixed(2) }}</strong></div>
      </div>

      <section class="panel">
        <div class="panel-header"><h2>Por proceso</h2></div>
        <div class="desplazable">
          <table class="tabla">
            <thead><tr><th scope="col">Proceso</th><th scope="col" class="derecha">Ejecuciones</th><th scope="col" class="derecha">Éxito</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              @for (p of procesos(); track p.proceso) {
                <tr>
                  <td>{{ p.proceso }}</td>
                  <td class="derecha num">{{ p.total }}</td>
                  <td class="derecha num">{{ p.total ? p.tasa + ' %' : '—' }}</td>
                  <td class="derecha">
                    @if (d.relanzables.includes(p.proceso)) {
                      <button class="btn btn-ghost" type="button" (click)="relanzar(p.proceso)" [disabled]="relanzando() === p.proceso">
                        {{ relanzando() === p.proceso ? 'Iniciando…' : 'Ejecutar ahora' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header"><h2>Bitácora</h2><span class="small muted num">{{ d.ejecuciones.length }} trabajos</span></div>
        <div class="desplazable">
          <table class="tabla">
            <thead>
              <tr><th scope="col">Inicio</th><th scope="col">Proceso</th><th scope="col">Estado</th><th scope="col" class="derecha">Duración</th><th scope="col">Resultado</th><th scope="col"><span class="sr-only">Orchestrator</span></th></tr>
            </thead>
            <tbody>
              @for (e of d.ejecuciones; track e.id) {
                <tr>
                  <td class="num nowrap">{{ fecha(e.inicio) }}</td>
                  <td>{{ e.proceso }}<div class="small faint">{{ e.detalle?.origen }}</div></td>
                  <td>
                    @switch (e.estado) {
                      @case ('EXITOSA') { <span class="pill positiva">Exitosa</span> }
                      @case ('FALLIDA') { <span class="pill negativa">Fallida</span> }
                      @case ('PARCIAL') { <span class="pill aviso">Detenida</span> }
                      @default { <span class="pill">En curso</span> }
                    }
                  </td>
                  <td class="derecha num nowrap">{{ duracion(e.duracionSeg) }}</td>
                  <td>
                    {{ resultado(e) }}
                    @if (e.estado === 'FALLIDA' && e.detalle?.info) { <div class="small error">{{ primeraLinea(e.detalle!.info!) }}</div> }
                  </td>
                  <td class="derecha">
                    @if (e.detalle?.enlace) {
                      <a class="btn btn-ghost" [href]="e.detalle!.enlace" target="_blank" rel="noopener" aria-label="Abrir en Orchestrator"><vc-icono nombre="externo" /></a>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="muted">Sin ejecuciones en el periodo.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <div class="pila">@for (i of [1, 2]; track i) { <div class="esqueleto" style="height: 140px"></div> }</div>
    }
  `,
  styles: `
    :host { display: grid; gap: var(--gap); max-width: 1100px; }
    .titulo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .titulo p { margin-top: 4px; }
    .acciones, .fila { display: flex; gap: 8px; align-items: center; }
    .fila { margin-top: 12px; max-width: 420px; }
    .fila input { flex: 1; }
    .indicadores { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gap); }
    .kpi { display: grid; gap: 4px; padding: 16px var(--card-pad); }
    .kpi strong { font-size: 24px; font-weight: 600; }
    .kpi .mal { color: var(--negative); }
    .aviso-error { padding: 12px var(--card-pad); color: var(--negative); }
    .derecha { text-align: right; }
    .nowrap { white-space: nowrap; }
    .error { color: var(--negative); max-width: 520px; }
    .desplazable { overflow-x: auto; }
    .tabla { min-width: 720px; }
    .pila { display: grid; gap: var(--gap); }
    @media (max-width: 720px) {
      .titulo { flex-direction: column; }
      .indicadores { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class EjecucionesPagina {
  private readonly api = inject(ApiService);
  private readonly avisos = inject(MatSnackBar);

  protected readonly dias = signal(7);
  protected readonly datos = signal<Bitacora | null>(null);
  protected readonly cargando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly relanzando = signal<string | null>(null);
  protected nog = '';

  protected nogValido() { return /^\d{6,12}$/.test(this.nog.trim()); }

  /** Todos los procesos relanzables aparecen aunque no tengan ejecuciones en el periodo. */
  protected readonly procesos = computed(() => {
    const d = this.datos();
    if (!d) return [];
    const nombres = [...new Set([...d.relanzables, ...d.resumen.procesos.map((p) => p.proceso)])];
    return nombres.map((proceso) => d.resumen.procesos.find((p) => p.proceso === proceso) ?? { proceso, total: 0, exitosas: 0, tasa: 0 });
  });

  protected readonly costoIa = computed(() =>
    (this.datos()?.ejecuciones ?? []).reduce((s, e) => s + Number(e.detalle?.metricas?.['costoIaUsd'] ?? 0), 0));

  constructor() {
    effect(() => { this.dias(); this.cargar(); });
  }

  protected cargar() {
    this.cargando.set(true);
    this.api.ejecuciones(this.dias()).subscribe({
      next: (d) => { this.datos.set(d); this.cargando.set(false); },
      error: (e) => {
        this.cargando.set(false);
        this.avisos.open(e?.status === 403 ? 'Solo el administrador ve las ejecuciones.' : 'No se pudo cargar la bitácora.', 'Cerrar', { duration: 5000 });
      },
    });
  }

  protected capturar(evento: Event) {
    evento.preventDefault();
    const nog = this.nog.trim();
    if (!this.nogValido()) return;
    this.enviando.set(true);
    this.api.capturarNog(nog).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.nog = '';
        this.avisos.open(
          `NOG ${r.nog} en la cola con prioridad alta${r.yaRegistrado ? ' (ya estaba registrado: se revisará de nuevo)' : ''}. VC.Concurso lo capturará en su próxima ejecución.`,
          'Cerrar', { duration: 7000 });
      },
      error: (e) => {
        this.enviando.set(false);
        this.avisos.open(e?.error?.error ?? 'No se pudo encolar el NOG.', 'Cerrar', { duration: 6000 });
      },
    });
  }

  protected relanzar(proceso: string) {
    this.relanzando.set(proceso);
    this.api.relanzar(proceso).subscribe({
      next: () => {
        this.relanzando.set(null);
        this.avisos.open(`${proceso} se inició en el robot desatendido.`, undefined, { duration: 4000 });
        setTimeout(() => this.cargar(), 3000);
      },
      error: (e) => {
        this.relanzando.set(null);
        this.avisos.open(e?.error?.error ?? `No se pudo iniciar ${proceso}.`, 'Cerrar', { duration: 6000 });
      },
    });
  }

  protected fecha(iso: string) { return fechaHora.format(new Date(iso)).replace('.', ''); }

  protected duracion(seg: number | null) {
    if (seg === null) return '—';
    if (seg < 60) return `${seg} s`;
    const m = Math.floor(seg / 60);
    return m < 60 ? `${m} min ${seg % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  protected primeraLinea(texto: string) { return texto.split('\n')[0]!.slice(0, 160); }

  /** Lo que produjo el trabajo, en una frase. */
  protected resultado(e: Ejecucion) {
    const m = e.detalle?.metricas ?? {};
    const partes: string[] = [];
    const n = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : null);
    if (n('concursosNuevos') !== null) partes.push(`${n('concursosNuevos')} concursos nuevos`);
    if (n('concursosRevisados') !== null) partes.push(`${n('concursosRevisados')} concursos leídos`);
    if (n('documentosDescargados') !== null) partes.push(`${n('documentosDescargados')} documentos`);
    if (n('fichas') !== null) partes.push(`${n('fichas')} fichas`);
    if (n('costoIaUsd')) partes.push(`US$ ${n('costoIaUsd')!.toFixed(2)} de IA`);
    if (n('expedientes') !== null) partes.push(`${n('expedientes')} expedientes`);
    if (m['avisos'] && typeof m['avisos'] === 'object') {
      const a = m['avisos'] as Record<string, number>;
      const enviados = Object.entries(a).filter(([k]) => k.endsWith('enviado')).reduce((s, [, v]) => s + v, 0);
      partes.push(`${enviados} avisos enviados`);
    }
    return partes.join(' · ') || '—';
  }
}
