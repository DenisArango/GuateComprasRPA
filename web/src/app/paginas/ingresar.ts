import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api';
import { SesionService } from '../core/sesion';

@Component({
  selector: 'vc-ingresar',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="caja">
      <div class="marca">
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" /><path d="M8 10l8 13 8-13" /></svg>
        <span>Vigía de Contrataciones</span>
      </div>
      <h1>Ingresar</h1>
      <p class="muted intro">Concursos de Guatecompras que le sirven a tu empresa, con lo que piden y lo que te falta.</p>

      <form (ngSubmit)="ingresar()" #f="ngForm" novalidate>
        <div class="campo">
          <label for="correo">Correo</label>
          <input id="correo" name="correo" class="input" type="email" autocomplete="username" required [(ngModel)]="correo" />
        </div>
        <div class="campo">
          <label for="contrasena">Contraseña</label>
          <input id="contrasena" name="contrasena" class="input" type="password" autocomplete="current-password" required [(ngModel)]="contrasena" />
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="btn btn-primary enviar" type="submit" [disabled]="enviando()">
          {{ enviando() ? 'Ingresando…' : 'Ingresar' }}
        </button>
      </form>
    </section>
  `,
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 24px; }
    .caja { width: 100%; max-width: 380px; }
    .marca { display: flex; align-items: center; gap: 10px; font-weight: 600; margin-bottom: 40px; }
    .marca svg { width: 28px; height: 28px; }
    .marca rect { fill: var(--accent); }
    .marca path { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .intro { margin: 6px 0 28px; max-width: 34ch; }
    form { display: grid; gap: 16px; }
    .enviar { width: 100%; justify-content: center; height: 38px; margin-top: 4px; }
    .error { color: var(--negative); font-size: 13px; }
  `,
})
export class Ingresar {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected correo = '';
  protected contrasena = '';
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

  protected ingresar() {
    if (!this.correo.trim() || !this.contrasena) {
      this.error.set('Escribe tu correo y tu contraseña.');
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    this.api.ingresar(this.correo.trim(), this.contrasena).subscribe({
      next: (sesion) => {
        this.sesion.iniciar(sesion);
        this.router.navigateByUrl('/panel');
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(
          e.status === 423 ? 'Tu cuenta quedó bloqueada 15 minutos por varios intentos fallidos.'
          : e.status === 401 ? 'El correo o la contraseña no coinciden. Revisa e intenta de nuevo.'
          : 'No pudimos conectar con el servidor. Intenta de nuevo en un momento.',
        );
      },
    });
  }
}
