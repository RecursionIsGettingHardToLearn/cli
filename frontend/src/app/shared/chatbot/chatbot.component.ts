import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../core/auth/supabase.service';
import { AsistenteService, MensajeHistorial } from '../../core/services/asistente.service';
import { rutasParaRol } from './nav-catalogo';

interface MensajeChat {
  autor: 'user' | 'bot';
  texto: string;
  navTitulo?: string;
}

/**
 * Chatbot flotante de MediCloud.
 *
 * - Conoce las rutas de la app (nav-catalogo.ts) filtradas por el rol del
 *   usuario logueado, y puede NAVEGAR de verdad (router.navigate) cuando el
 *   backend devuelve navegar_a.
 * - El chat pasa por MS2 (/api/chat-asistente), que usa OpenAI si hay clave
 *   y reglas locales si no. La API key NUNCA vive en el frontend.
 */
@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Boton flotante -->
    <button
      class="cb-fab"
      (click)="toggle()"
      [attr.aria-label]="abierto() ? 'Cerrar asistente' : 'Abrir asistente'">
      <i class="pi" [ngClass]="abierto() ? 'pi-times' : 'pi-comments'"></i>
    </button>

    <!-- Panel de chat -->
    <div class="cb-panel" *ngIf="abierto()">
      <div class="cb-header">
        <i class="pi pi-sparkles"></i>
        <div>
          <div class="cb-title">Asistente MediCloud</div>
          <div class="cb-subtitle">Te ayudo a navegar y resolver dudas</div>
        </div>
      </div>

      <div class="cb-messages" #mensajesBox>
        <div class="cb-msg bot" *ngIf="mensajes().length === 0">
          ¡Hola! Puedo llevarte a cualquier sección de la app o responder tus
          preguntas. Prueba con una sugerencia:
        </div>

        <div class="cb-chips" *ngIf="mensajes().length === 0">
          <button class="cb-chip" *ngFor="let s of sugerencias" (click)="enviar(s)">
            {{ s }}
          </button>
        </div>

        <div
          *ngFor="let m of mensajes()"
          class="cb-msg"
          [ngClass]="m.autor === 'user' ? 'user' : 'bot'">
          {{ m.texto }}
          <div class="cb-nav-tag" *ngIf="m.navTitulo">
            <i class="pi pi-arrow-right"></i> Abriendo {{ m.navTitulo }}…
          </div>
        </div>

        <div class="cb-msg bot cb-typing" *ngIf="cargando()">
          <span></span><span></span><span></span>
        </div>
      </div>

      <div class="cb-input-row">
        <input
          type="text"
          [(ngModel)]="borrador"
          (keyup.enter)="enviar()"
          [disabled]="cargando()"
          placeholder="Escribe un mensaje…"
          maxlength="2000" />
        <button
          class="cb-send"
          (click)="enviar()"
          [disabled]="cargando() || !borrador.trim()"
          aria-label="Enviar">
          <i class="pi pi-send"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { position: fixed; bottom: 24px; right: 24px; z-index: 1200; }

    .cb-fab {
      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
      background: #0f6e56; color: #fff; font-size: 22px;
      box-shadow: 0 6px 18px rgba(15, 110, 86, .35);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s ease, background .15s ease;
    }
    .cb-fab:hover { background: #0c5a47; transform: scale(1.06); }

    .cb-panel {
      position: absolute; bottom: 72px; right: 0;
      width: min(360px, calc(100vw - 32px)); height: min(480px, calc(100vh - 140px));
      background: #fff; border-radius: 16px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(31, 41, 55, .22);
      display: flex; flex-direction: column;
      font-size: 14px; color: #1f2937;
    }

    .cb-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; background: #0f6e56; color: #fff;
    }
    .cb-header .pi { font-size: 20px; }
    .cb-title { font-weight: 600; }
    .cb-subtitle { font-size: 11.5px; opacity: .85; }

    .cb-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }

    .cb-msg { max-width: 85%; padding: 9px 12px; border-radius: 12px; line-height: 1.45; white-space: pre-wrap; }
    .cb-msg.bot  { background: #eef2f1; color: #1f2937; align-self: flex-start; border-bottom-left-radius: 4px; }
    .cb-msg.user { background: #0f6e56; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }

    .cb-nav-tag { margin-top: 6px; font-size: 12px; font-weight: 600; color: #0f6e56; display: flex; align-items: center; gap: 5px; }

    .cb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .cb-chip {
      border: 1px solid #0f6e56; color: #0f6e56; background: #fff;
      border-radius: 999px; padding: 6px 11px; font-size: 12.5px; cursor: pointer;
      transition: background .12s ease, color .12s ease;
    }
    .cb-chip:hover { background: #0f6e56; color: #fff; }

    .cb-typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
    .cb-typing span {
      width: 7px; height: 7px; border-radius: 50%; background: #9ca3af;
      animation: cb-blink 1.2s infinite ease-in-out;
    }
    .cb-typing span:nth-child(2) { animation-delay: .18s; }
    .cb-typing span:nth-child(3) { animation-delay: .36s; }
    @keyframes cb-blink { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }

    .cb-input-row { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e5e7eb; }
    .cb-input-row input {
      flex: 1; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 12px;
      font: inherit; outline: none;
    }
    .cb-input-row input:focus { border-color: #0f6e56; }
    .cb-send {
      width: 40px; border: none; border-radius: 10px; cursor: pointer;
      background: #0f6e56; color: #fff; font-size: 15px;
    }
    .cb-send:disabled { background: #9ca3af; cursor: default; }

    @media (max-width: 480px) {
      :host { bottom: 16px; right: 16px; }
    }
  `],
})
export class ChatbotComponent {
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private asistente = inject(AsistenteService);

  @ViewChild('mensajesBox') mensajesBox?: ElementRef<HTMLDivElement>;

  abierto = signal(false);
  cargando = signal(false);
  mensajes = signal<MensajeChat[]>([]);
  borrador = '';

  private rol = toSignal(this.supabase.role$, { initialValue: null });

  sugerencias = ['¿A dónde puedo ir?', 'Llévame a mis citas', '¿Qué hay en reportes?'];

  toggle(): void {
    this.abierto.update(v => !v);
    if (this.abierto()) this.scrollAbajo();
  }

  enviar(textoSugerido?: string): void {
    const texto = (textoSugerido ?? this.borrador).trim();
    if (!texto || this.cargando()) return;

    // El historial se arma ANTES de agregar el mensaje nuevo: el backend lo
    // recibe por separado en "mensaje" (evita duplicarlo).
    const historial: MensajeHistorial[] = this.mensajes()
      .slice(-10)
      .map(m => ({ rol: m.autor === 'user' ? 'user' : 'assistant', contenido: m.texto }));

    this.mensajes.update(m => [...m, { autor: 'user', texto }]);
    this.borrador = '';
    this.cargando.set(true);
    this.scrollAbajo();

    const rol = this.rol();
    const rutas = rutasParaRol(rol);

    this.asistente
      .chat(
        texto,
        historial,
        rol,
        rutas.map(({ path, titulo, descripcion }) => ({ path, titulo, descripcion }))
      )
      .subscribe({
        next: r => {
          this.cargando.set(false);
          const destino = r.navegar_a ? rutas.find(x => x.path === r.navegar_a) : undefined;
          this.mensajes.update(m => [
            ...m,
            { autor: 'bot', texto: r.respuesta, navTitulo: destino?.titulo },
          ]);
          this.scrollAbajo();
          if (destino) {
            setTimeout(() => this.router.navigate([destino.path]), 650);
          }
        },
        error: () => {
          this.cargando.set(false);
          this.mensajes.update(m => [
            ...m,
            { autor: 'bot', texto: 'No pude conectar con el asistente ahora mismo. Intenta de nuevo en unos segundos.' },
          ]);
          this.scrollAbajo();
        },
      });
  }

  private scrollAbajo(): void {
    setTimeout(() => {
      const el = this.mensajesBox?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 60);
  }
}
