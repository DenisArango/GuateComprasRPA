import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api';
import { CierrePipe, diasHasta, estadoConcurso, FechaCortaPipe, ModalidadPipe, QuetzalesPipe, LegiblePipe } from '../core/formato';
import type { Oportunidad } from '../core/modelos';
import { SesionService } from '../core/sesion';
import { Icono } from '../compartido/icono';

type Vista = 'abiertas' | 'siguiendo' | 'todas';

@Component({
  selector: 'vc-oportunidades',
  imports: [RouterLink, Icono, QuetzalesPipe, FechaCortaPipe, CierrePipe, ModalidadPipe, LegiblePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titulo">
      <h1>Oportunidades</h1>
      <p class="muted">Concursos compatibles con el perfil, ordenados por compatibilidad. La barra más clara indica un puntaje preliminar, calculado antes de leer las bases.</p>
    </header>

    <div class="herramientas">
      <div class="vistas" role="group" aria-label="Vista">
        @for (v of vistas; track v.id) {
          <button class="btn" type="button" [attr.aria-pressed]="vista() === v.id" (click)="vista.set(v.id)">{{ v.texto }}</button>
        }
      </div>
      <label class="buscar">
        <span class="sr-only">Buscar</span>
        <vc-icono nombre="buscar" />
        <input class="input" type="search" placeholder="Buscar por título, entidad o NOG…" autocomplete="off"
               [value]="buscar()" (input)="escribir($event)" />
      </label>
    </div>

    <section class="panel">
      @if (error()) {
        <p class="vacio" role="alert">No pudimos cargar las oportunidades: {{ error() }}.</p>
      } @else if (filas() === null) {
        <div class="cargando">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="esqueleto"></div> }</div>
      } @else if (!filas()!.length) {
        <p class="vacio">{{ textoVacio() }}</p>
      } @else {
        <div class="desplazable">
          <table class="tabla">
            <thead>
              <tr>
                <th scope="col" class="col-nog">NOG</th>
                <th scope="col">Concurso</th>
                <th scope="col" class="col-modalidad">Modalidad</th>
                <th scope="col">Cierre</th>
                <th scope="col" class="num col-monto">Monto</th>
                <th scope="col">Compatibilidad</th>
                <th scope="col" class="num col-faltan">Faltan</th>
                <th scope="col" class="col-estado">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (o of filas(); track o.nog) {
                <tr class="fila-enlace" (click)="abrir(o)">
                  <td class="mono col-nog">{{ o.nog }}</td>
                  <td class="concurso">
                    <a [routerLink]="['/concursos', o.nog]" (click)="$event.stopPropagation()">{{ o.titulo | legible }}</a>
                    <span class="small muted">{{ o.entidad | legible: 'entidad' }}</span>
                  </td>
                  <td class="muted sin-salto col-modalidad">{{ o.modalidad | modalidad }}</td>
                  <td class="cierre sin-salto">
                    <span class="num">{{ o.fechaCierre | fechaCorta }}</span>
                    <span class="small" [class.urgente]="urgente(o)" [class.faint]="!urgente(o)">{{ o.fechaCierre | cierre }}</span>
                  </td>
                  <td class="num col-monto">{{ o.monto | quetzales }}</td>
                  <td>
                    <span class="puntaje" [title]="o.etapa === 'PRELIMINAR' ? 'Puntaje preliminar' : 'Puntaje con ficha'">
                      <span class="num">{{ o.puntaje }}</span>
                      <span class="barra" [class.preliminar]="o.etapa === 'PRELIMINAR'"><span [style.width.%]="o.puntaje"></span></span>
                    </span>
                  </td>
                  <td class="num col-faltan" [title]="(o.faltantes ?? []).join(', ')">{{ o.faltantes === null ? '—' : o.faltantes.length }}</td>
                  <td class="col-estado">
                    @if (o.seguimiento === 'PARTICIPARE') { <span class="pill dato">Participaré</span> }
                    @else if (o.seguimiento === 'SIGUIENDO') { <span class="pill dato">Siguiendo</span> }
                    @else { <span [class]="'pill ' + estado(o).tono">{{ estado(o).texto }}</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="pie small faint">{{ filas()!.length }} concurso{{ filas()!.length === 1 ? '' : 's' }}</p>
      }
    </section>
  `,
  styles: `
    .titulo { display: grid; gap: 4px; margin-bottom: 20px; }
    .titulo p { max-width: 70ch; }
    .herramientas { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .vistas { display: flex; gap: 6px; }
    .buscar { position: relative; flex: 0 1 340px; }
    .buscar vc-icono { position: absolute; left: 10px; top: 9px; color: var(--faint); }
    .buscar .input { padding-left: 34px; }
    .desplazable { overflow-x: auto; }
    .tabla { min-width: 620px; }
    /* En pantallas medianas se ocultan las columnas secundarias; cierre y compatibilidad siempre visibles */
    @media (max-width: 1200px) { .col-modalidad { display: none; } }
    @media (max-width: 960px) { .col-monto, .col-nog, .col-faltan { display: none; } }
    .concurso { max-width: 420px; }
    .concurso a { display: block; font-weight: 500; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .concurso span, .cierre > span { display: block; }
    .sin-salto { white-space: nowrap; }
    .concurso .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .urgente { color: var(--negative); font-weight: 500; }
    .puntaje { display: grid; grid-template-columns: 24px 80px; align-items: center; gap: 8px; font-weight: 500; }
    .cargando { display: grid; gap: 18px; padding: var(--card-pad); }
    .pie { padding: 10px 12px; border-top: 1px solid var(--rule); }
    @media (max-width: 720px) { .buscar { flex-basis: 100%; } }
    /* Teléfono: cada fila se apila (título arriba; cierre y compatibilidad abajo) */
    @media (max-width: 600px) {
      .tabla { min-width: 0; }
      .tabla tr { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px 16px; padding: 14px 16px; border-bottom: 1px solid var(--rule); }
      .tabla td { display: block; height: auto; padding: 0; border: 0; }
      .concurso { grid-column: 1 / -1; max-width: none; }
      .concurso a { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .tabla thead, .tabla .col-nog, .tabla .col-modalidad, .tabla .col-monto, .tabla .col-faltan, .tabla .col-estado { display: none; }
      .cierre > span { display: inline; margin-right: 6px; }
    }
  `,
})
export class Oportunidades {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly busquedas = new Subject<string>();

  protected readonly vistas: { id: Vista; texto: string }[] = [
    { id: 'abiertas', texto: 'Abiertas' },
    { id: 'siguiendo', texto: 'En seguimiento' },
    { id: 'todas', texto: 'Todas' },
  ];
  protected readonly vista = signal<Vista>('abiertas');
  protected readonly buscar = signal('');
  protected readonly filas = signal<Oportunidad[] | null>(null);
  protected readonly error = signal('');

  constructor() {
    this.busquedas.pipe(debounceTime(250), takeUntilDestroyed()).subscribe((t) => this.buscar.set(t));
    effect((limpiar) => {
      const perfil = this.sesion.perfilActivo();
      const vista = this.vista();
      const buscar = this.buscar();
      if (!perfil) return;
      this.filas.set(null);
      this.error.set('');
      const s = this.api.oportunidades(perfil.id, vista, buscar).subscribe({
        next: (f) => this.filas.set(f),
        error: (e) => this.error.set(e?.error?.error ?? 'error de conexión'),
      });
      limpiar(() => s.unsubscribe());
    });
  }

  protected escribir(e: Event) {
    this.busquedas.next((e.target as HTMLInputElement).value);
  }

  protected abrir(o: Oportunidad) {
    this.router.navigate(['/concursos', o.nog]);
  }

  protected estado(o: Oportunidad) {
    return estadoConcurso(o.estado);
  }

  protected urgente(o: Oportunidad) {
    const d = diasHasta(o.fechaCierre);
    return d !== null && d >= 0 && d <= 1;
  }

  protected textoVacio() {
    if (this.buscar()) return `Ningún concurso coincide con «${this.buscar()}».`;
    if (this.vista() === 'siguiendo') return 'Todavía no sigues ningún concurso. Ábrelo y marca «Seguir» o «Participaré».';
    return 'No hay oportunidades abiertas para este perfil. Revisa las palabras clave y categorías del perfil de empresa.';
  }
}
