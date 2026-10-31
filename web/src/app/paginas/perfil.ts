import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api';
import { diasHasta, ModalidadPipe } from '../core/formato';
import type { Catalogos, Perfil } from '../core/modelos';
import { SesionService } from '../core/sesion';
import { Icono } from '../compartido/icono';
import { PerfilTelegram } from './perfil-telegram';

/** Perfil de empresa (CU-02): lo que vende, dónde, por cuánto y qué documentos tiene vigentes. */
@Component({
  selector: 'vc-perfil',
  imports: [FormsModule, Icono, ModalidadPipe, PerfilTelegram],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="titulo">
      <div>
        <h1>Perfil de empresa</h1>
        <p class="muted">Con estos datos se eligen los concursos del boletín y se calcula la compatibilidad.</p>
      </div>
      @if (p()) {
        <div class="acciones">
          @if (cambios()) { <span class="small muted">Cambios sin guardar</span> }
          <button class="btn btn-primary" type="button" (click)="guardar()" [disabled]="guardando() || !cambios()">
            {{ guardando() ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      }
    </header>

    @if (error()) {
      <div class="panel vacio" role="alert">{{ error() }}</div>
    } @else if (p(); as p) {
      <div class="secciones">
        <section class="panel">
          <div class="panel-header"><h2>Empresa</h2></div>
          <div class="panel-body dos">
            <div class="campo">
              <label for="nombre">Nombre comercial</label>
              <input id="nombre" class="input" [ngModel]="p.nombre" (ngModelChange)="cambiar({ nombre: $event })" autocomplete="organization" />
            </div>
            <div class="campo">
              <label for="nit">NIT</label>
              <input id="nit" class="input num" [ngModel]="p.nit ?? ''" (ngModelChange)="cambiar({ nit: $event || null })" inputmode="numeric" spellcheck="false" />
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h2>Qué vende</h2></div>
          <div class="panel-body pila">
            <div class="campo">
              <span class="campo-label" id="lbl-categorias">Categorías de Guatecompras</span>
              <div class="chips" role="group" aria-labelledby="lbl-categorias">
                @for (c of catalogos()?.categorias; track c) {
                  <button type="button" class="chip" [attr.aria-pressed]="p.categorias.includes(c)" (click)="alternar('categorias', c)">{{ c }}</button>
                }
              </div>
            </div>
            <div class="campo">
              <label for="palabra">Palabras clave</label>
              <div class="chips">
                @for (k of p.palabrasClave; track k) {
                  <span class="chip activo">{{ k }}<button type="button" class="quitar" (click)="quitarPalabra(k)" [attr.aria-label]="'Quitar ' + k"><vc-icono nombre="cerrar" /></button></span>
                }
              </div>
              <div class="agregar">
                <input id="palabra" class="input" placeholder="Ej.: tóner, papel bond…" [(ngModel)]="palabra" (keydown.enter)="agregarPalabra()" />
                <button class="btn" type="button" (click)="agregarPalabra()" [disabled]="palabra.trim().length < 2"><vc-icono nombre="mas" />Agregar</button>
              </div>
              <p class="ayuda">Se buscan en el título y en el objeto del concurso, sin distinguir tildes ni mayúsculas.</p>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h2>Dónde y por cuánto</h2></div>
          <div class="panel-body pila">
            <div class="campo">
              <span class="campo-label" id="lbl-modalidades">Modalidades</span>
              <div class="chips" role="group" aria-labelledby="lbl-modalidades">
                @for (m of catalogos()?.modalidades; track m) {
                  <button type="button" class="chip" [attr.aria-pressed]="p.modalidades.includes(m)" (click)="alternar('modalidades', m)">{{ m | modalidad }}</button>
                }
              </div>
              <p class="ayuda">Sin selección, se aceptan todas.</p>
            </div>
            <div class="campo">
              <span class="campo-label" id="lbl-departamentos">Departamentos donde puede entregar</span>
              <div class="chips" role="group" aria-labelledby="lbl-departamentos">
                @for (d of catalogos()?.departamentos; track d) {
                  <button type="button" class="chip" [attr.aria-pressed]="p.departamentos.includes(d)" (click)="alternar('departamentos', d)">{{ d }}</button>
                }
              </div>
              <p class="ayuda">Sin selección, todo el país.</p>
            </div>
            <div class="tres">
              <div class="campo">
                <label for="min">Monto mínimo (Q)</label>
                <input id="min" class="input num" type="number" min="0" step="1000" [ngModel]="p.montoMin" (ngModelChange)="cambiar({ montoMin: numero($event) })" />
              </div>
              <div class="campo">
                <label for="max">Monto máximo (Q)</label>
                <input id="max" class="input num" type="number" min="0" step="1000" [ngModel]="p.montoMax" (ngModelChange)="cambiar({ montoMax: numero($event) })" />
              </div>
              <div class="campo">
                <label for="umbral">Compatibilidad mínima para avisar</label>
                <div class="umbral">
                  <input id="umbral" type="range" min="0" max="100" step="5" [ngModel]="p.umbralCompatibilidad" (ngModelChange)="cambiar({ umbralCompatibilidad: +$event })" />
                  <span class="num">{{ p.umbralCompatibilidad }}</span>
                </div>
              </div>
            </div>
            @if (rangoInvalido()) { <p class="error small" role="alert">El monto mínimo no puede ser mayor que el máximo.</p> }
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>Documentos de la empresa</h2>
            <span class="small muted num">{{ p.documentos.length }} registrados</span>
          </div>
          <div class="desplazable">
            <table class="tabla">
              <thead><tr><th scope="col">Documento</th><th scope="col">Vence</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                @for (d of p.documentos; track d.documento; let i = $index) {
                  <tr>
                    <td>{{ nombreDocumento(d.documento) }}</td>
                    <td><input class="input fecha" type="date" [attr.aria-label]="'Vencimiento de ' + nombreDocumento(d.documento)" [ngModel]="d.venceEn" (ngModelChange)="cambiarVencimiento(i, $event)" /></td>
                    <td>
                      @switch (vigencia(d.venceEn)) {
                        @case ('vencido') { <span class="pill negativa">Vencido</span> }
                        @case ('por-vencer') { <span class="pill aviso">Vence en {{ diasDe(d.venceEn) }} días</span> }
                        @case ('vigente') { <span class="pill positiva">Vigente</span> }
                        @default { <span class="small faint">No vence</span> }
                      }
                    </td>
                    <td class="derecha"><button class="btn btn-ghost" type="button" (click)="quitarDocumento(i)">Quitar</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="muted">Agrega los documentos que ya tienes para saber cuáles te faltan en cada concurso.</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (disponibles().length) {
            <div class="agregar pie">
              <label class="sr-only" for="nuevo-doc">Documento a agregar</label>
              <select id="nuevo-doc" class="input" [(ngModel)]="nuevoDocumento">
                <option value="">Agregar documento…</option>
                @for (d of disponibles(); track d.codigo) { <option [value]="d.codigo">{{ d.nombre }}</option> }
              </select>
              <button class="btn" type="button" (click)="agregarDocumento()" [disabled]="!nuevoDocumento"><vc-icono nombre="mas" />Agregar</button>
            </div>
          }
        </section>

        <vc-perfil-telegram [perfilId]="p.id" />
      </div>
    } @else {
      <div class="secciones">@for (i of [1, 2, 3]; track i) { <div class="esqueleto" style="height: 160px"></div> }</div>
    }
  `,
  styles: `
    .titulo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; max-width: 960px; }
    .titulo p { margin-top: 4px; }
    .acciones { display: flex; align-items: center; gap: 12px; }
    .secciones { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); max-width: 960px; }
    .pila { display: grid; gap: 24px; }
    .dos { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .tres { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 16px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px;
      border: 1px solid var(--control); border-radius: var(--radius-chip); background: var(--surface);
      font: 400 13px var(--font); color: var(--text); cursor: pointer;
      transition: background-color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
    }
    button.chip:hover { background: var(--raised); }
    button.chip:active { transform: scale(0.97); }
    .chip[aria-pressed='true'], .chip.activo { background: var(--accent-soft); border-color: #9fcdbd; color: #0a4a3b; }
    .chip.activo { padding-right: 4px; cursor: default; }
    .quitar { display: inline-grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: 3px; background: none; color: inherit; cursor: pointer; }
    .quitar:hover { background: #cfe7de; }
    .quitar vc-icono { width: 12px; height: 12px; }
    .agregar { display: flex; gap: 8px; max-width: 480px; }
    .pie { max-width: none; padding: 12px var(--card-pad) 16px; border-top: 1px solid var(--rule); }
    .pie select { max-width: 360px; }
    .umbral { display: flex; align-items: center; gap: 12px; height: var(--control-height); }
    .umbral input { flex: 1; accent-color: var(--accent); }
    .umbral .num { width: 28px; text-align: right; font-weight: 500; }
    .fecha { width: 160px; }
    .tabla { min-width: 560px; }
    .derecha { text-align: right; }
    .desplazable { overflow-x: auto; }
    .error { color: var(--negative); }
    @media (max-width: 720px) {
      .titulo { flex-direction: column; }
      .dos, .tres { grid-template-columns: 1fr; }
    }
  `,
})
export class PerfilPagina {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly avisos = inject(MatSnackBar);

  protected readonly p = signal<Perfil | null>(null);
  protected readonly catalogos = signal<Catalogos | null>(null);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  private readonly original = signal('');

  protected palabra = '';
  protected nuevoDocumento = '';

  protected readonly cambios = computed(() => !!this.p() && JSON.stringify(this.p()) !== this.original());
  protected readonly rangoInvalido = computed(() => {
    const p = this.p();
    return !!p && p.montoMin !== null && p.montoMax !== null && p.montoMin > p.montoMax;
  });
  protected readonly disponibles = computed(() => {
    const tiene = new Set(this.p()?.documentos.map((d) => d.documento));
    return (this.catalogos()?.documentos ?? []).filter((d) => !tiene.has(d.codigo));
  });

  constructor() {
    effect((limpiar) => {
      const perfil = this.sesion.perfilActivo();
      if (!perfil) return;
      this.p.set(null);
      const s = forkJoin([this.api.perfil(perfil.id), this.api.catalogos()]).subscribe({
        next: ([p, c]) => {
          this.catalogos.set(c);
          this.cargar(p);
        },
        error: (e) => this.error.set(e?.status === 403 ? 'No tienes permiso para ver este perfil.' : 'No pudimos cargar el perfil. Intenta de nuevo.'),
      });
      limpiar(() => s.unsubscribe());
    });
  }

  private cargar(p: Perfil) {
    this.p.set(p);
    this.original.set(JSON.stringify(p));
  }

  protected cambiar(parcial: Partial<Perfil>) {
    this.p.update((p) => (p ? { ...p, ...parcial } : p));
  }

  protected alternar(campo: 'categorias' | 'modalidades' | 'departamentos', valor: string) {
    const lista = this.p()?.[campo] ?? [];
    this.cambiar({ [campo]: lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor] });
  }

  protected agregarPalabra() {
    const k = this.palabra.trim().toLowerCase();
    const p = this.p();
    if (!p || k.length < 2) return;
    if (!p.palabrasClave.includes(k)) this.cambiar({ palabrasClave: [...p.palabrasClave, k] });
    this.palabra = '';
  }

  protected quitarPalabra(k: string) {
    this.cambiar({ palabrasClave: (this.p()?.palabrasClave ?? []).filter((x) => x !== k) });
  }

  protected agregarDocumento() {
    const p = this.p();
    if (!p || !this.nuevoDocumento) return;
    this.cambiar({ documentos: [...p.documentos, { documento: this.nuevoDocumento, venceEn: null }] });
    this.nuevoDocumento = '';
  }

  protected quitarDocumento(i: number) {
    this.cambiar({ documentos: (this.p()?.documentos ?? []).filter((_, j) => j !== i) });
  }

  protected cambiarVencimiento(i: number, valor: string) {
    this.cambiar({ documentos: (this.p()?.documentos ?? []).map((d, j) => (j === i ? { ...d, venceEn: valor || null } : d)) });
  }

  protected numero(v: unknown) {
    return v === null || v === '' || v === undefined ? null : Number(v);
  }

  protected nombreDocumento(codigo: string) {
    return this.catalogos()?.documentos.find((d) => d.codigo === codigo)?.nombre ?? codigo;
  }

  protected diasDe(fecha: string | null) {
    return diasHasta(fecha ? `${fecha}T00:00:00Z` : null);
  }

  protected vigencia(fecha: string | null) {
    const d = this.diasDe(fecha);
    if (d === null) return 'sin-fecha';
    return d < 0 ? 'vencido' : d <= 30 ? 'por-vencer' : 'vigente';
  }

  protected guardar() {
    const p = this.p();
    if (!p || this.rangoInvalido()) return;
    this.guardando.set(true);
    this.api.guardarPerfil(p).subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.original.set(JSON.stringify(p));
        this.sesion.perfiles.update((l) => l.map((x) => (x.id === p.id ? { ...x, nombre: p.nombre } : x)));
        this.avisos.open(`Perfil guardado. Se recalculó la compatibilidad de ${r.recalculadas} concursos.`, undefined, { duration: 4000 });
      },
      error: (e) => {
        this.guardando.set(false);
        this.avisos.open(e?.status === 400 ? 'Revisa los datos: hay campos inválidos.' : 'No se guardó el perfil. Intenta de nuevo.', 'Cerrar', { duration: 5000 });
      },
    });
  }
}
