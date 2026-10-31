import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../core/api';
import { SesionService } from '../core/sesion';
import { Icono } from './icono';

/** Marco de la aplicación: barra lateral (marca, perfil activo, navegación, usuario) y lienzo. */
@Component({
  selector: 'vc-marco',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="lateral" [class.abierta]="menuAbierto()">
      <div class="marca">
        <a routerLink="/panel" class="logo" aria-label="Vigía de Contrataciones, ir al panel">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" /><path d="M8 10l8 13 8-13" /></svg>
          <span>Vigía</span>
        </a>
        <button class="btn btn-ghost solo-movil" type="button" (click)="menuAbierto.set(!menuAbierto())" [attr.aria-expanded]="menuAbierto()" aria-controls="navegacion">
          {{ menuAbierto() ? 'Cerrar' : 'Menú' }}
        </button>
      </div>

      <div class="contenido-lateral" id="navegacion">
        <div class="campo perfil">
          <label for="perfil-activo" class="small muted">Empresa</label>
          @if (sesion.perfiles().length > 1) {
            <select id="perfil-activo" class="input" [value]="sesion.perfilActivo()?.id" (change)="cambiarPerfil($event)">
              @for (p of sesion.perfiles(); track p.id) { <option [value]="p.id">{{ p.nombre }}</option> }
            </select>
          } @else {
            <p id="perfil-activo" class="nombre-perfil">{{ sesion.perfilActivo()?.nombre ?? 'Sin perfil asignado' }}</p>
          }
        </div>

        <nav aria-label="Principal">
          <a routerLink="/panel" routerLinkActive="activo"><vc-icono nombre="panel" />Panel</a>
          <a routerLink="/oportunidades" routerLinkActive="activo"><vc-icono nombre="lista" />Oportunidades</a>
          <a routerLink="/perfil" routerLinkActive="activo"><vc-icono nombre="entidad" />Perfil de empresa</a>
          <span class="seccion-nav small faint">Datos abiertos</span>
          <a routerLink="/historial" routerLinkActive="activo"><vc-icono nombre="historial" />Historial</a>
          <a routerLink="/riesgos" routerLinkActive="activo"><vc-icono nombre="bandera" />Banderas rojas</a>
          @if (sesion.usuario()?.rol === 'ADMIN') {
            <span class="seccion-nav small faint">Administración</span>
            <a routerLink="/ejecuciones" routerLinkActive="activo"><vc-icono nombre="actividad" />Ejecuciones</a>
          }
        </nav>

        <div class="usuario">
          <div>
            <p class="nombre">{{ sesion.usuario()?.nombre }}</p>
            <p class="small faint">{{ sesion.usuario()?.correo }}</p>
          </div>
          <button class="btn btn-ghost icono-solo" type="button" (click)="sesion.cerrar()" aria-label="Cerrar sesión" title="Cerrar sesión">
            <vc-icono nombre="salir" />
          </button>
        </div>
      </div>
    </aside>

    <main class="lienzo" id="contenido">
      @if (sesion.perfilActivo()) {
        <router-outlet />
      } @else if (cargando()) {
        <div class="esqueleto" style="width: 240px; height: 28px"></div>
      } @else {
        <div class="panel vacio">Tu usuario todavía no administra ningún perfil de empresa. Pide al administrador que te asigne uno.</div>
      }
    </main>
  `,
  styles: `
    :host { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 100vh; }
    .lateral {
      position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column;
      padding: 20px 16px; border-right: 1px solid var(--border); background: var(--ground);
    }
    .marca { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 20px; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
    .logo svg { width: 26px; height: 26px; }
    .logo rect { fill: var(--accent); }
    .logo path { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .contenido-lateral { display: flex; flex-direction: column; gap: 20px; flex: 1; min-height: 0; }
    .perfil { padding: 0 8px; }
    .nombre-perfil { font-weight: 500; line-height: 20px; }
    nav { display: grid; gap: 2px; }
    nav a {
      display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px; border-radius: var(--radius-control);
      color: var(--muted); text-decoration: none; font-weight: 500;
      transition: background-color var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
    }
    .seccion-nav { padding: 16px 10px 4px; }
    nav a:hover { background: var(--active); color: var(--text); }
    nav a.activo { background: var(--active); color: var(--text); }
    .usuario { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 8px 0; border-top: 1px solid var(--border); }
    .usuario .nombre { font-weight: 500; }
    .icono-solo { width: 34px; padding: 0; justify-content: center; }
    .lienzo { padding: 28px var(--pad) 48px; min-width: 0; max-width: 1360px; width: 100%; }
    .solo-movil { display: none; }

    @media (max-width: 860px) {
      :host { grid-template-columns: minmax(0, 1fr); }
      .lateral { position: sticky; z-index: 10; height: auto; padding: 10px 16px; border-right: 0; border-bottom: 1px solid var(--border); }
      .marca { padding: 0; }
      .solo-movil { display: inline-flex; }
      .contenido-lateral { display: none; padding-top: 16px; }
      .lateral.abierta .contenido-lateral { display: flex; }
      .lienzo { padding: 20px 16px 40px; }
    }
  `,
})
export class Marco {
  private readonly api = inject(ApiService);
  protected readonly sesion = inject(SesionService);
  protected readonly menuAbierto = signal(false);
  protected readonly cargando = signal(true);

  constructor() {
    this.api.perfiles().subscribe({
      next: (perfiles) => {
        this.sesion.perfiles.set(perfiles);
        if (!perfiles.some((p) => p.id === this.sesion.perfilId()) && perfiles[0]) this.sesion.elegirPerfil(perfiles[0].id);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
    inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuAbierto.set(false));
  }

  protected cambiarPerfil(evento: Event) {
    this.sesion.elegirPerfil(Number((evento.target as HTMLSelectElement).value));
  }
}
