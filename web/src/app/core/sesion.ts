import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import type { PerfilResumen, Sesion, Usuario } from './modelos';

const CLAVE = 'vigia.sesion';
const CLAVE_PERFIL = 'vigia.perfil';

/** Sesión del dashboard y perfil de empresa activo. */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly router = inject(Router);
  private readonly sesion = signal<Sesion | null>(this.leer());

  readonly usuario = computed<Usuario | null>(() => this.sesion()?.usuario ?? null);
  readonly token = computed(() => this.sesion()?.token ?? null);
  readonly perfiles = signal<PerfilResumen[]>([]);
  readonly perfilId = signal<number | null>(Number(sessionStorage.getItem(CLAVE_PERFIL)) || null);
  readonly perfilActivo = computed(() => this.perfiles().find((p) => p.id === this.perfilId()) ?? this.perfiles()[0] ?? null);

  iniciar(sesion: Sesion) {
    sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
    this.sesion.set(sesion);
  }

  elegirPerfil(id: number) {
    sessionStorage.setItem(CLAVE_PERFIL, String(id));
    this.perfilId.set(id);
  }

  cerrar() {
    sessionStorage.removeItem(CLAVE);
    this.sesion.set(null);
    this.perfiles.set([]);
    this.router.navigateByUrl('/ingresar');
  }

  private leer(): Sesion | null {
    try { return JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null'); } catch { return null; }
  }
}

/** Agrega el token y, si la sesión venció (401), vuelve a la pantalla de ingreso. */
export const interceptorSesion: HttpInterceptorFn = (req, next) => {
  const sesion = inject(SesionService);
  const token = sesion.token();
  const conToken = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(conToken).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && token) sesion.cerrar();
      return throwError(() => error);
    }),
  );
};

export const requiereSesion: CanActivateFn = () =>
  inject(SesionService).token() ? true : inject(Router).parseUrl('/ingresar');
