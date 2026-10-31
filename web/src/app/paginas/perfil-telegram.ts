import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api';
import type { EstadoTelegram } from '../core/modelos';

/** Avisos por Telegram del perfil (RF-NOT-02): vincula un chat con el bot mediante un enlace de un solo uso. */
@Component({
  selector: 'vc-perfil-telegram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="panel-header">
        <h2>Avisos por Telegram</h2>
        @if (estado()?.chats) { <span class="pill positiva">{{ estado()!.chats === 1 ? '1 chat vinculado' : estado()!.chats + ' chats vinculados' }}</span> }
      </div>
      <div class="panel-body pila">
        @if (!estado()) {
          <div class="esqueleto" style="height: 40px"></div>
        } @else if (!estado()!.disponible) {
          <p class="muted">El bot de Telegram no está configurado en el servidor.</p>
        } @else {
          <p class="muted">
            Además del correo, recibe en Telegram las oportunidades nuevas, los cambios de los concursos que sigues y los recordatorios de cierre.
            @if (estado()!.bot) { Bot: <strong>&#64;{{ estado()!.bot }}</strong>. }
          </p>
          @if (esperando()) {
            <p class="aviso" role="status">
              Se abrió Telegram. Presiona <strong>Iniciar</strong> en el chat del bot; esta página se actualiza sola.
              @if (enlace()) { Si no se abrió, <a [href]="enlace()" target="_blank" rel="noopener">abre el enlace aquí</a>. }
            </p>
          }
          <div class="acciones">
            <button class="btn btn-primary" type="button" (click)="vincular()" [disabled]="esperando()">
              {{ estado()!.chats ? 'Vincular otro chat' : 'Vincular Telegram' }}
            </button>
            @if (estado()!.chats) {
              <button class="btn btn-ghost" type="button" (click)="desvincular()">Quitar Telegram</button>
            }
          </div>
          @if (estado()!.error) { <p class="small error" role="alert">No se pudo consultar el bot: {{ estado()!.error }}</p> }
        }
      </div>
    </section>
  `,
  styles: `
    .pila { display: grid; gap: 16px; }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .aviso { padding: 10px 12px; border-radius: var(--radius-chip); background: var(--accent-soft); color: #0a4a3b; }
    .error { color: var(--negative); }
  `,
})
export class PerfilTelegram {
  private readonly api = inject(ApiService);
  private readonly avisos = inject(MatSnackBar);

  readonly perfilId = input.required<number>();

  protected readonly estado = signal<EstadoTelegram | null>(null);
  protected readonly esperando = signal(false);
  protected readonly enlace = signal('');
  private sondeo: ReturnType<typeof setInterval> | undefined;

  constructor() {
    effect(() => this.consultar(this.perfilId()));
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  private consultar(id: number, alTerminar?: (e: EstadoTelegram) => void) {
    this.api.telegram(id).subscribe({
      next: (e) => { this.estado.set(e); alTerminar?.(e); },
      error: () => this.estado.set({ disponible: false, bot: null, chats: 0 }),
    });
  }

  protected vincular() {
    const id = this.perfilId();
    // La pestaña se abre antes de la respuesta para que el navegador no la bloquee
    const pestana = window.open('', '_blank');
    this.api.vincularTelegram(id).subscribe({
      next: ({ enlace }) => {
        this.enlace.set(enlace);
        if (pestana) pestana.location.href = enlace;
        this.esperar(id, this.estado()?.chats ?? 0);
      },
      error: () => {
        pestana?.close();
        this.avisos.open('No se pudo generar el enlace de Telegram. Intenta de nuevo.', 'Cerrar', { duration: 5000 });
      },
    });
  }

  /** Revisa cada 3 s si el chat ya se vinculó (el enlace vale 15 min; se deja de esperar a los 5). */
  private esperar(id: number, antes: number) {
    this.detener();
    this.esperando.set(true);
    const limite = Date.now() + 5 * 60_000;
    this.sondeo = setInterval(() => {
      if (Date.now() > limite) { this.detener(); return; }
      this.consultar(id, (e) => {
        if (e.chats > antes) {
          this.detener();
          this.avisos.open('Telegram vinculado. Te llegó un mensaje de confirmación.', undefined, { duration: 4000 });
        }
      });
    }, 3000);
  }

  private detener() {
    clearInterval(this.sondeo);
    this.esperando.set(false);
  }

  protected desvincular() {
    const id = this.perfilId();
    this.api.desvincularTelegram(id).subscribe({
      next: () => { this.consultar(id); this.avisos.open('Se quitó Telegram de este perfil.', undefined, { duration: 3000 }); },
      error: () => this.avisos.open('No se pudo quitar Telegram. Intenta de nuevo.', 'Cerrar', { duration: 5000 }),
    });
  }
}
