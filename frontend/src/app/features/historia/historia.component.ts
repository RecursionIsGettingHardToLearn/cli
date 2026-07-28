import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  HISTORIA_POR_PACIENTE, LIST_PACIENTES, CITAS, CREATE_EPISODIO,
} from '../../core/graphql/queries';

@Component({
  selector: 'app-historia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Historia clínica</h1>

    <div class="card">
      <div class="field">
        <label>Paciente</label>
        <select [(ngModel)]="pacienteId" [ngModelOptions]="{standalone:true}" (change)="cargar()">
          <option [ngValue]="null">— Seleccionar paciente —</option>
          <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
        </select>
      </div>
    </div>

    <div class="card" *ngIf="pacienteId && historia">
      <h3>Historia <span class="badge">{{ historia.estado }}</span></h3>
      <p class="meta">Apertura: {{ historia.fechaApertura | date:'short' }} · {{ historia.episodios?.length || 0 }} episodio(s)</p>

      <div *ngFor="let e of historia.episodios" class="epi">
        <div class="meta">{{ e.fecha | date:'short' }} · médico {{ e.medicoUid }}</div>
        <p *ngIf="e.motivoConsulta"><strong>Motivo:</strong> {{ e.motivoConsulta }}</p>
        <p *ngIf="e.evolucion"><strong>Evolución:</strong> {{ e.evolucion }}</p>
        <p *ngIf="e.diagnosticoTexto"><strong>Diagnóstico:</strong> {{ e.diagnosticoTexto }}</p>
      </div>
      <p *ngIf="(historia.episodios?.length || 0) === 0" class="empty">Sin episodios registrados.</p>

      <!-- Formulario de nuevo episodio: solo médico/admin -->
      <div *ngIf="puedeEditar()" class="nuevo-epi">
        <div class="epi-head">
          <h4>Nuevo episodio</h4>
          <button *ngIf="!mostrarForm" class="btn-primary" (click)="mostrarForm = true">+ Registrar consulta</button>
        </div>

        <form *ngIf="mostrarForm" #f="ngForm" (ngSubmit)="guardar(f)" novalidate>
          <div class="field">
            <label for="epi-motivo">Motivo de consulta *</label>
            <input id="epi-motivo" name="motivo" required maxlength="200"
                   [(ngModel)]="form.motivoConsulta" #mot="ngModel"
                   [class.invalid]="mot.invalid && mot.touched"
                   placeholder="Ej: Dolor abdominal de 3 días">
          </div>
          <div class="field">
            <label for="epi-evol">Evolución</label>
            <textarea id="epi-evol" name="evolucion" rows="3" maxlength="2000"
                      [(ngModel)]="form.evolucion"
                      placeholder="Notas clínicas, hallazgos, tratamiento indicado…"></textarea>
          </div>
          <div class="field">
            <label for="epi-diag">Diagnóstico</label>
            <textarea id="epi-diag" name="diagnostico" rows="2" maxlength="1000"
                      [(ngModel)]="form.diagnosticoTexto"
                      placeholder="Impresión diagnóstica"></textarea>
          </div>
          <div class="field" *ngIf="citasPaciente.length > 0">
            <label for="epi-cita">Cita asociada (opcional)</label>
            <select id="epi-cita" name="cita" [(ngModel)]="form.citaId">
              <option [ngValue]="null">— Sin cita —</option>
              <option *ngFor="let c of citasPaciente" [ngValue]="c.id">
                {{ c.fechaHora | date:'short' }} · {{ c.especialidad }} ({{ c.estado }})
              </option>
            </select>
            <span class="hint">Al asociarla, la cita quedará marcada como ATENDIDA.</span>
          </div>

          <div class="acciones">
            <button type="button" class="btn-secondary" (click)="cancelar()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="guardando">
              {{ guardando ? 'Guardando…' : 'Guardar episodio' }}
            </button>
          </div>
          <p *ngIf="error" class="err">{{ error }}</p>
        </form>
      </div>
    </div>

    <div class="card" *ngIf="pacienteId && !historia && consultado">
      <p class="empty">Este paciente aún no tiene historia clínica abierta.</p>
    </div>
  `,
  styles: [`
    .field { display:flex; flex-direction:column; gap:4px; max-width:560px; margin-bottom:12px; }
    .field label { font-size:12px; font-weight:600; color:#374151; }
    .field select, .field input, .field textarea {
      padding:8px 10px; border:1px solid #d1d5db; border-radius:6px; font:inherit; font-size:14px; background:#fff;
    }
    .field select:focus, .field input:focus, .field textarea:focus { outline:none; border-color:#0f6e56; }
    .field input.invalid { border-color:#dc2626; }
    .field textarea { resize:vertical; }
    .hint { font-size:11px; color:#6b7280; }
    .meta { font-size:12px; color:#6b7280; }
    .badge { font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; background:#d1fae5; color:#065f46; margin-left:6px; }
    .epi { border-left:3px solid #0f6e56; padding:8px 12px; margin:10px 0; background:#f9fafb; border-radius:0 6px 6px 0; }
    .epi p { margin:4px 0; font-size:13px; color:#374151; }
    .empty { color:#6b7280; text-align:center; padding:16px; }
    .nuevo-epi { margin-top:20px; padding-top:16px; border-top:1px solid #e5e7eb; }
    .epi-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .epi-head h4 { margin:0; font-size:14px; color:#0f6e56; }
    .acciones { display:flex; gap:10px; justify-content:flex-end; max-width:560px; }
    .err { color:#dc2626; font-size:13px; margin-top:8px; }
  `]
})
export class HistoriaComponent implements OnInit {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);
  private rol = toSignal(this.supabase.role$, { initialValue: null });

  pacientes: any[] = [];
  pacienteId: string | null = null;
  historia: any = null;
  consultado = false;

  // Formulario de episodio
  mostrarForm = false;
  guardando = false;
  error = '';
  citasPaciente: any[] = [];
  private readonly vacio = { motivoConsulta: '', evolucion: '', diagnosticoTexto: '', citaId: null as string | null };
  form = { ...this.vacio };

  puedeEditar() { return this.rol() === 'MEDICO' || this.rol() === 'ADMINISTRADOR'; }

  ngOnInit() {
    this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
      .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
  }

  cargar() {
    this.historia = null; this.consultado = false;
    this.mostrarForm = false; this.form = { ...this.vacio }; this.citasPaciente = [];
    if (!this.pacienteId) return;

    this.apollo.query<any>({ query: HISTORIA_POR_PACIENTE, variables: { pacienteId: this.pacienteId }, fetchPolicy: 'network-only' })
      .subscribe({
        next: r => { this.historia = r.data?.historiaPorPaciente ?? null; this.consultado = true; },
        error: () => { this.historia = null; this.consultado = true; }
      });

    // Citas AGENDADAS de este paciente para el selector opcional.
    if (this.puedeEditar()) {
      this.apollo.query<any>({ query: CITAS, fetchPolicy: 'network-only' })
        .subscribe({
          next: r => {
            this.citasPaciente = (r.data?.citas ?? [])
              .filter((c: any) => c.paciente?.id === this.pacienteId && c.estado === 'AGENDADA');
          },
          error: () => { this.citasPaciente = []; }
        });
    }
  }

  cancelar() { this.mostrarForm = false; this.error = ''; this.form = { ...this.vacio }; }

  guardar(f: NgForm) {
    if (f.invalid) { f.control.markAllAsTouched(); return; }
    this.error = '';
    this.guardando = true;
    const limpio = (v: string) => (v && v.trim() ? v.trim() : null);
    const input = {
      historiaId: this.historia.id,
      citaId: this.form.citaId || null,
      motivoConsulta: this.form.motivoConsulta.trim(),
      evolucion: limpio(this.form.evolucion),
      diagnosticoTexto: limpio(this.form.diagnosticoTexto),
    };
    this.apollo.mutate<any>({ mutation: CREATE_EPISODIO, variables: { input } })
      .subscribe({
        next: () => { this.guardando = false; this.cancelar(); this.cargar(); },
        error: e => { this.guardando = false; this.error = e.message || 'No se pudo guardar el episodio.'; },
      });
  }
}
