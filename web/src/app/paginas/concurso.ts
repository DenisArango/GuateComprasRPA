import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api';
import {
  CierrePipe, diasHasta, DocumentoPipe, estadoConcurso, FechaMediaPipe, NOMBRES_DOCUMENTO, FechaLargaPipe, ModalidadPipe, QuetzalesPipe, LegiblePipe,
} from '../core/formato';
import type { DetalleConcurso, EstadoSeguimiento, HistorialConcurso } from '../core/modelos';
import { SesionService } from '../core/sesion';
import { Icono } from '../compartido/icono';
import { TablaProcesos } from '../compartido/procesos';

const FACTORES: { clave: string; texto: string; peso: number }[] = [
  { clave: 'contenido', texto: 'Objeto y palabras clave', peso: 30 },
  { clave: 'categoria', texto: 'Categoría', peso: 25 },
  { clave: 'requisitos', texto: 'Documentos que ya tienes', peso: 20 },
  { clave: 'monto', texto: 'Monto dentro del rango', peso: 15 },
  { clave: 'departamento', texto: 'Departamento', peso: 10 },
];

const TIPOS_CAMBIO: Record<string, string> = {
  DOCUMENTO: 'Documentos nuevos o modificados',
  FECHA: 'Cambió la fecha de cierre',
  ESTADO: 'Cambió el estado en Guatecompras',
  ACLARACION: 'Se publicó una aclaración',
};

const TIPOS_REQUISITO: Record<string, string> = {
  legal: 'Legal', tecnico: 'Técnico', financiero: 'Financiero', experiencia: 'Experiencia', otro: 'Otro',
};

@Component({
  selector: 'vc-concurso',
  imports: [RouterLink, Icono, TablaProcesos, QuetzalesPipe, FechaLargaPipe, FechaMediaPipe, CierrePipe, ModalidadPipe, DocumentoPipe, LegiblePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="volver small muted" routerLink="/oportunidades"><vc-icono nombre="flecha-izquierda" />Oportunidades</a>

    @if (error()) {
      <div class="panel vacio" role="alert">{{ error() }}</div>
    } @else if (c(); as c) {
      <header class="encabezado">
        <div class="titulos">
          <p class="small muted"><span class="mono">NOG {{ c.nog }}</span> · {{ c.modalidad | modalidad }} · {{ estado().texto }}</p>
          <h1>{{ c.titulo | legible }}</h1>
          <p class="muted">{{ c.entidad | legible: 'entidad' }}@if (c.unidadCompradora) { · {{ c.unidadCompradora | legible: 'entidad' }} }</p>
        </div>
        <div class="acciones">
          <button class="btn" type="button" [attr.aria-pressed]="c.seguimiento === 'SIGUIENDO'" (click)="seguir('SIGUIENDO')" [disabled]="guardando()">
            <vc-icono nombre="marcador" />{{ c.seguimiento === 'SIGUIENDO' ? 'Siguiendo' : 'Seguir' }}
          </button>
          <button class="btn" [class.btn-primary]="c.seguimiento !== 'PARTICIPARE'" type="button" [attr.aria-pressed]="c.seguimiento === 'PARTICIPARE'" (click)="seguir('PARTICIPARE')" [disabled]="guardando()">
            <vc-icono nombre="check" />Participaré
          </button>
          <button class="btn btn-ghost" type="button" [attr.aria-pressed]="c.seguimiento === 'DESCARTADO'" (click)="seguir('DESCARTADO')" [disabled]="guardando()">Descartar</button>
        </div>
      </header>

      <section class="panel datos" aria-label="Datos clave">
        <div><p class="small muted">Cierre de ofertas</p><p class="valor">{{ cierre() | fechaLarga: true }}</p><p class="small" [class.urgente]="urgente()">{{ cierre() | cierre }}</p></div>
        <div><p class="small muted">Monto</p><p class="valor num">{{ (c.ficha?.monto ?? c.montoPortal) | quetzales }}</p><p class="small faint">{{ c.ficha?.monto ? 'según las bases' : 'publicado en el portal' }}</p></div>
        <div><p class="small muted">Compatibilidad</p>
          @if (c.compatibilidad; as k) {
            <p class="valor num">{{ k.puntaje }} <span class="small muted">de 100</span></p>
            <p class="small faint">{{ k.etapa === 'COMPLETA' ? 'con la ficha de las bases' : 'preliminar, sin ficha' }}</p>
          } @else { <p class="valor">—</p> }
        </div>
        <div><p class="small muted">Te falta</p>
          <p class="valor num" [class.negativo]="faltantes().length">{{ c.compatibilidad ? faltantes().length : '—' }}</p>
          <p class="small faint">{{ faltantes().length === 1 ? 'documento' : 'documentos' }} para participar</p>
        </div>
      </section>

      <div class="rejilla">
        <div class="principal">
          <section class="panel">
            <div class="panel-header">
              <h2>Resumen de las bases</h2>
              @if (c.ficha; as f) {
                <span class="pill" [class.positiva]="f.validadaPor === 'HUMANO'">
                  {{ f.validadaPor === 'HUMANO' ? 'Validada por una persona' : 'Leída por IA · confianza ' + porcentaje(f.confianza) }}
                </span>
              }
            </div>
            <div class="panel-body">
              @if (c.ficha; as f) {
                <p class="resumen">{{ f.resumen }}</p>
                <dl class="ficha">
                  <div><dt>Objeto</dt><dd>{{ f.objeto }}</dd></div>
                  @if (f.plazoEntrega) { <div><dt>Plazo de entrega</dt><dd>{{ f.plazoEntrega }}</dd></div> }
                  @if (f.lugarEntrega) { <div><dt>Lugar de entrega</dt><dd>{{ f.lugarEntrega }}</dd></div> }
                  @if (f.garantias.length) {
                    <div><dt>Garantías</dt><dd>
                      @for (g of f.garantias; track $index) {
                        <span class="linea">{{ g.tipo }}@if (g.porcentaje !== null) { · <span class="num">{{ g.porcentaje }} %</span> }@if (g.pagina) { <span class="faint"> (pág. {{ g.pagina }})</span> }</span>
                      }
                    </dd></div>
                  }
                </dl>
                <p class="small faint aviso-ia">Extraído automáticamente de las bases. Confirma los datos en el documento oficial antes de ofertar.</p>
              } @else {
                <p class="muted">{{ textoSinFicha() }}</p>
              }
            </div>
          </section>

          @if (c.ficha?.requisitos?.length) {
            <section class="panel">
              <div class="panel-header">
                <h2>Requisitos</h2>
                <span class="small muted num">{{ cumplidos() }} de {{ c.ficha!.requisitos.length }} cubiertos</span>
              </div>
              <div class="desplazable">
                <table class="tabla">
                  <thead><tr><th scope="col">Requisito</th><th scope="col">Tipo</th><th scope="col">Tú</th></tr></thead>
                  <tbody>
                    @for (r of c.ficha!.requisitos; track $index) {
                      <tr>
                        <td>
                          <span class="requisito">{{ r.descripcion }}</span>
                          <span class="small faint">
                            {{ r.obligatorio ? 'Obligatorio' : 'Opcional' }}@if (r.referencia) { · {{ r.referencia }} }
                          </span>
                          @if (r.posibleRestrictivo) {
                            <span class="restrictivo small"><vc-icono nombre="alerta" />Podría ser restrictivo{{ r.motivoRestrictivo ? ': ' + r.motivoRestrictivo : '' }}</span>
                          }
                        </td>
                        <td class="muted">{{ tipoRequisito(r.tipo) }}</td>
                        <td>
                          @if (r.cumple === true) { <span class="pill positiva">Lo tienes</span> }
                          @else if (r.cumple === false) { <span class="pill negativa">Falta</span> }
                          @else { <span class="faint small">Revisar</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          @if (c.ficha?.criterios?.length) {
            <section class="panel">
              <div class="panel-header"><h2>Criterios de calificación</h2></div>
              <ul class="criterios">
                @for (k of c.ficha!.criterios; track $index) {
                  <li><span>{{ k.criterio }}</span><span class="num">{{ k.ponderacion === null ? '—' : k.ponderacion + ' pts' }}</span></li>
                }
              </ul>
            </section>
          }

          <section class="panel">
            <div class="panel-header">
              <h2>Compras anteriores parecidas</h2>
              <a class="small" routerLink="/historial">Buscar en el historial</a>
            </div>
            @if (historial(); as h) {
              @if (h.similares.length || h.entidad.length) {
                @if (h.similares.length) {
                  <p class="subtitulo small muted">Procesos con título parecido, de cualquier entidad: sirven como referencia de precio.</p>
                  <vc-tabla-procesos [procesos]="h.similares" [conRiesgo]="false" [compacta]="true" />
                }
                @if (h.entidad.length) {
                  <p class="subtitulo small muted">Lo último que adjudicó esta entidad ({{ h.entidadTotal }} procesos en el histórico).</p>
                  <vc-tabla-procesos [procesos]="h.entidad" [conRiesgo]="false" [compacta]="true" />
                }
              } @else {
                <p class="panel-body muted">No hay adjudicaciones parecidas en el histórico OCDS.</p>
              }
            } @else {
              <div class="panel-body"><div class="esqueleto"></div></div>
            }
          </section>
        </div>

        <aside class="lateral">
          @if (c.compatibilidad; as k) {
            <section class="panel">
              <div class="panel-header"><h2>Por qué este puntaje</h2></div>
              <div class="panel-body factores">
                @for (f of factores(); track f.clave) {
                  <div>
                    <div class="fila"><span>{{ f.texto }}</span><span class="num">{{ f.puntos }} <span class="faint">/ {{ f.peso }}</span></span></div>
                    <div class="barra" [class.preliminar]="k.etapa === 'PRELIMINAR'"><span [style.width.%]="f.porcentaje"></span></div>
                  </div>
                }
                @if (palabras().length) {
                  <p class="small muted">Coincide con: {{ palabras().join(', ') }}</p>
                }
              </div>
            </section>
          }

          @if (faltantes().length) {
            <section class="panel">
              <div class="panel-header"><h2>Te falta</h2></div>
              <ul class="faltan panel-body">
                @for (d of faltantes(); track d) { <li><vc-icono nombre="alerta" />{{ d | documento }}</li> }
              </ul>
              <p class="small faint pie-panel">Incluye documentos vencidos antes del cierre. Actualízalos en <a routerLink="/perfil">Perfil de empresa</a>.</p>
            </section>
          }

          @if (c.expediente; as e) {
            <section class="panel">
              <div class="panel-header"><h2>Expediente de oferta</h2><span class="small faint">{{ e.generadoEn | fechaMedia }}</span></div>
              <div class="panel-body expediente">
                <p class="small">Carpeta con las bases, tus documentos vigentes, el checklist y los borradores:</p>
                <code class="ruta">{{ e.ruta }}</code>
                <p class="small" [class.muted]="!e.faltantes.length">
                  {{ e.faltantes.length ? 'Faltan: ' + nombresDocumentos(e.faltantes) : 'Tienes todos los documentos que piden.' }}
                </p>
              </div>
            </section>
          }

          <section class="panel">
            <div class="panel-header"><h2>Documentos</h2></div>
            @if (c.documentos.length) {
              <ul class="documentos">
                @for (d of c.documentos; track d.id) {
                  <li>
                    <button class="btn-doc" type="button" (click)="descargar(d.id, d.nombreOriginal)">
                      <vc-icono nombre="documento" />
                      <span class="texto-doc">
                        <span class="nombre-doc">{{ d.nombreOriginal }}</span>
                        <span class="small faint">{{ d.paginas ? d.paginas + ' págs. · ' : '' }}{{ tamano(d.tamanoBytes) }}</span>
                      </span>
                      <vc-icono nombre="descargar" />
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="panel-body muted">El robot todavía no descargó los documentos de este concurso.</p>
            }
            <a class="btn btn-ghost portal" [href]="c.url" target="_blank" rel="noopener">Ver en Guatecompras<vc-icono nombre="externo" /></a>
          </section>

          @if (c.cambios.length) {
            <section class="panel">
              <div class="panel-header"><h2>Cambios detectados</h2></div>
              <ol class="cambios panel-body">
                @for (x of c.cambios; track $index) {
                  <li>
                    <p>{{ tipoCambio(x.tipo) }}</p>
                    @if (x.resumenIa) { <p class="small muted">{{ x.resumenIa }}</p> }
                    <p class="small faint">{{ x.detectadoEn | fechaLarga: true }}</p>
                  </li>
                }
              </ol>
            </section>
          }

          @if (c.compatibilidad) {
            <section class="panel calificar">
              <p>¿Te sirvió esta recomendación?</p>
              <div class="acciones">
                <button class="btn" type="button" [attr.aria-pressed]="calificacion() === 'relevante'" (click)="calificar(true)">Sí</button>
                <button class="btn" type="button" [attr.aria-pressed]="calificacion() === 'no_relevante'" (click)="calificar(false)">No</button>
              </div>
            </section>
          }
        </aside>
      </div>
    } @else {
      <div class="cargando"><div class="esqueleto" style="width: 50%; height: 28px"></div><div class="esqueleto" style="height: 88px"></div><div class="esqueleto" style="height: 240px"></div></div>
    }
  `,
  styles: `
    .expediente { display: grid; gap: 8px; }
    .ruta { display: block; padding: 6px 8px; border-radius: var(--radius-control); background: var(--raised); font-size: 12px; overflow-wrap: anywhere; }
    .volver { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; margin-bottom: 16px; }
    .encabezado { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
    .titulos { display: grid; gap: 4px; max-width: 80ch; }
    .acciones { display: flex; gap: 8px; flex-wrap: wrap; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: var(--gap); }
    .datos > div { padding: 16px var(--card-pad); display: grid; gap: 2px; align-content: start; }
    .datos > div + div { border-left: 1px solid var(--border); }
    .valor { font-size: 18px; line-height: 26px; font-weight: 500; }
    .urgente { color: var(--negative); font-weight: 500; }
    .negativo { color: var(--negative); }
    .rejilla { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--gap); align-items: start; }
    .principal, .lateral { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); min-width: 0; }
    .resumen { font-size: 15px; line-height: 24px; max-width: 72ch; }
    .ficha { display: grid; gap: 12px; margin: 20px 0 0; }
    .ficha > div { display: grid; grid-template-columns: 160px 1fr; gap: 16px; }
    .ficha dt { color: var(--muted); }
    .ficha dd { margin: 0; }
    .linea { display: block; }
    .aviso-ia { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--rule); }
    .desplazable { overflow-x: auto; }
    .requisito { display: block; }
    td .small { display: block; margin-top: 2px; }
    .restrictivo { display: flex !important; align-items: center; gap: 6px; color: var(--pill-warning-ink); }
    .restrictivo vc-icono, .faltan vc-icono { flex: none; }
    .criterios, .faltan, .documentos, .cambios { list-style: none; margin: 0; }
    .criterios { padding: 0 var(--card-pad) 12px; }
    .criterios li { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; }
    .criterios li + li { border-top: 1px solid var(--rule); }
    .factores { display: grid; gap: 14px; }
    .fila { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .faltan { display: grid; gap: 8px; }
    .faltan li { display: flex; align-items: center; gap: 8px; color: var(--negative); }
    .pie-panel { padding: 0 var(--card-pad) 16px; }
    .documentos { padding: 0 8px; }
    .btn-doc {
      display: grid; grid-template-columns: 16px minmax(0, 1fr) 16px; align-items: center; gap: 10px; width: 100%;
      padding: 10px 12px; border: 0; border-radius: var(--radius-control); background: none; color: inherit;
      font: inherit; text-align: left; cursor: pointer; transition: background-color var(--t-fast) var(--ease-out);
    }
    .btn-doc:hover { background: var(--raised); }
    .texto-doc { display: grid; min-width: 0; }
    .nombre-doc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .portal { margin: 8px 8px 12px; }
    .cambios { display: grid; gap: 14px; }
    .cambios li { padding-left: 14px; border-left: 2px solid var(--border); display: grid; gap: 2px; }
    .calificar .acciones { flex: none; }
    .calificar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px var(--card-pad); }
    .cargando { display: grid; gap: 16px; }
    .subtitulo { padding: 0 var(--card-pad) 8px; }
    .subtitulo + vc-tabla-procesos, vc-tabla-procesos + .subtitulo { margin-top: 0; }
    vc-tabla-procesos + .subtitulo { padding-top: 16px; border-top: 1px solid var(--rule); }

    @media (max-width: 1100px) { .rejilla { grid-template-columns: 1fr; } }
    @media (max-width: 720px) {
      .encabezado { flex-direction: column; }
      .datos { grid-template-columns: 1fr 1fr; }
      .datos > div:nth-child(3) { border-left: 0; }
      .datos > div:nth-child(n + 3) { border-top: 1px solid var(--border); }
      .ficha > div { grid-template-columns: 1fr; gap: 2px; }
    }
  `,
})
export class ConcursoPagina {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly avisos = inject(MatSnackBar);

  /** Parámetro de la ruta (withComponentInputBinding). */
  readonly nog = input.required<string>();

  protected readonly c = signal<DetalleConcurso | null>(null);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly calificacion = signal<string | null>(null);
  protected readonly historial = signal<HistorialConcurso | null>(null);

  protected readonly estado = computed(() => estadoConcurso(this.c()?.estado ?? null));
  protected readonly cierre = computed(() => this.c()?.ficha?.fechaLimiteOfertas ?? this.c()?.fechaCierre ?? null);
  protected readonly urgente = computed(() => {
    const d = diasHasta(this.cierre());
    return d !== null && d >= 0 && d <= 1;
  });
  protected readonly faltantes = computed(() => this.c()?.compatibilidad?.faltantes ?? []);
  protected readonly cumplidos = computed(() => (this.c()?.ficha?.requisitos ?? []).filter((r) => r.cumple).length);
  protected readonly palabras = computed(() => {
    const p = this.c()?.compatibilidad?.detalle?.['palabras'];
    return Array.isArray(p) ? p : [];
  });

  protected readonly factores = computed(() => {
    const d = this.c()?.compatibilidad?.detalle ?? {};
    return FACTORES.map((f) => {
      const v = typeof d[f.clave] === 'number' ? (d[f.clave] as number) : 0;
      return { ...f, puntos: Math.round(v * f.peso), porcentaje: v * 100 };
    });
  });

  constructor() {
    effect((limpiar) => {
      const perfil = this.sesion.perfilActivo();
      const nog = this.nog();
      if (!perfil) return;
      this.c.set(null);
      this.error.set('');
      const s = this.api.concurso(nog, perfil.id).subscribe({
        next: (c) => {
          this.c.set(c);
          this.calificacion.set(c.compatibilidad?.calificacion ?? null);
          this.api.historialConcurso(c.nog).subscribe({ next: (h) => this.historial.set(h), error: () => this.historial.set({ entidad: [], entidadTotal: 0, similares: [] }) });
        },
        error: (e) => this.error.set(e?.status === 404 ? `No encontramos el concurso con NOG ${nog}.` : 'No pudimos cargar el concurso. Intenta de nuevo.'),
      });
      limpiar(() => s.unsubscribe());
    });
  }

  protected seguir(estado: EstadoSeguimiento) {
    const c = this.c();
    const perfil = this.sesion.perfilActivo();
    if (!c || !perfil) return;
    const nuevo = c.seguimiento === estado ? null : estado;
    this.guardando.set(true);
    this.api.seguir(c.nog, perfil.id, nuevo).subscribe({
      next: (r) => {
        this.c.set({ ...c, seguimiento: r.estado });
        this.guardando.set(false);
        // Participaré arma el expediente en el robot (CU-16 automático)
        if (r.expediente === 'INICIADO') this.avisos.open('Se está armando el expediente de oferta: en un minuto aparece en esta página.', undefined, { duration: 6000 });
        if (r.expediente === 'SIN_FICHA') this.avisos.open('El expediente se arma cuando la ficha esté lista.', 'Cerrar', { duration: 5000 });
        if (r.expediente === 'INICIADO') setTimeout(() => this.recargarExpediente(), 45_000);
      },
      error: () => {
        this.guardando.set(false);
        this.avisos.open('No se guardó el cambio. Intenta de nuevo.', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected nombresDocumentos(codigos: string[]) { return codigos.map((c) => NOMBRES_DOCUMENTO[c] ?? c).join(', '); }

  /** Vuelve a pedir el concurso para mostrar el expediente recién armado. */
  private recargarExpediente() {
    const c = this.c();
    const perfil = this.sesion.perfilActivo();
    if (!c || !perfil) return;
    this.api.concurso(c.nog, perfil.id).subscribe({ next: (d) => this.c.update((x) => (x && x.nog === d.nog ? { ...x, expediente: d.expediente } : x)) });
  }

  protected calificar(relevante: boolean) {
    const c = this.c();
    const perfil = this.sesion.perfilActivo();
    if (!c || !perfil) return;
    const valor = relevante ? 'relevante' : 'no_relevante';
    const nuevo = this.calificacion() === valor ? null : relevante;
    this.api.calificar(c.nog, perfil.id, nuevo).subscribe({
      next: () => {
        this.calificacion.set(nuevo === null ? null : valor);
        if (nuevo !== null) this.avisos.open('Gracias. Usaremos tu respuesta para afinar las recomendaciones.', undefined, { duration: 3000 });
      },
      error: () => this.avisos.open('No se guardó tu respuesta.', 'Cerrar', { duration: 4000 }),
    });
  }

  protected descargar(id: number, nombre: string) {
    this.api.documento(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => this.avisos.open('No se pudo descargar el documento.', 'Cerrar', { duration: 4000 }),
    });
  }

  protected porcentaje(v: number) {
    return `${Math.round(v * 100)} %`;
  }

  protected tamano(bytes: number) {
    return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  protected tipoRequisito(t: string) {
    return TIPOS_REQUISITO[t] ?? t;
  }

  protected tipoCambio(t: string) {
    return TIPOS_CAMBIO[t] ?? t;
  }

  protected textoSinFicha() {
    const e = this.c()?.estado;
    if (e === 'REVISION_MANUAL') return 'La ficha está en revisión humana porque la IA no tuvo suficiente confianza. Aparecerá aquí cuando se valide.';
    if (e === 'CAPTURADO' || e === 'TEXTO_EXTRAIDO') return 'Los documentos ya se capturaron; la IA los está leyendo.';
    return 'Todavía no hay ficha: el robot no ha descargado las bases de este concurso. El puntaje es preliminar.';
  }
}

