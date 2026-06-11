import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { MI_PACIENTE, CREAR_CITA } from '../../core/graphql/queries';
import { Ms2Service } from '../../core/services/ms2.service';

@Component({
  selector: 'app-pre-triaje',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Pre-triaje</h1>

    <div class="card">
      <h3>Describe tus síntomas</h3>
      <p class="meta">La IA sugiere una especialidad y un nivel de urgencia. No reemplaza una valoración médica.</p>
      <textarea [(ngModel)]="sintomas" [ngModelOptions]="{standalone:true}" rows="3"
                placeholder="Ej: tengo dolor de pecho y me cuesta respirar desde ayer"></textarea>
      <button class="btn-primary" [disabled]="!sintomas.trim() || cargando" (click)="evaluar()">
        {{ cargando ? 'Evaluando…' : 'Evaluar síntomas' }}
      </button>

      <div *ngIf="error" class="error-banner">{{ error }}</div>

      <div *ngIf="resultado" class="resultado" [class.alta]="resultado.urgencia==='ALTA'">
        <p *ngIf="resultado.respuesta" style="margin:0 0 8px;">{{ resultado.respuesta }}</p>
        <div><strong>Especialidad sugerida:</strong> {{ resultado.especialidad }}</div>
        <div><strong>Urgencia:</strong> {{ resultado.urgencia }}</div>
        <div *ngIf="resultado.signos_alarma?.length" style="margin-top:8px;">
          <strong>Signos de alarma:</strong>
          <ul style="margin:4px 0 0 18px; padding:0;">
            <li *ngFor="let s of resultado.signos_alarma">{{ s }}</li>
          </ul>
        </div>
        <div *ngIf="resultado.recomendaciones?.length" style="margin-top:8px;">
          <strong>Recomendaciones:</strong>
          <ul style="margin:4px 0 0 18px; padding:0;">
            <li *ngFor="let rec of resultado.recomendaciones">{{ rec }}</li>
          </ul>
        </div>
        <div class="meta" style="margin-top:8px;">Proveedor: {{ resultado.proveedor }} · Confianza: {{ resultado.confianza | percent }}</div>
      </div>
    </div>

    <div class="card" *ngIf="resultado">
      <h3>Agendar cita con esta sugerencia</h3>
      <div *ngIf="miPacienteId">
        <div class="field"><label>Fecha y hora <span class="req">*</span></label>
          <input type="datetime-local" [(ngModel)]="fechaHora" [ngModelOptions]="{standalone:true}"></div>
        <div *ngIf="error" class="error-banner">{{ error }}</div>
        <div *ngIf="ok" class="resultado">✓ Cita agendada. Revísala en "Citas".</div>
        <button class="btn-primary" [disabled]="!fechaHora || guardando" (click)="agendar()">
          {{ guardando ? 'Agendando…' : 'Agendar cita' }}
        </button>
      </div>
      <div *ngIf="!miPacienteId">
        <p class="meta">No encontramos tu ficha de paciente vinculada. Puedes llevar esta sugerencia a recepción.</p>
        <button class="btn-secondary" (click)="irACitas()">Ver Citas</button>
      </div>
    </div>
  `,
  styles: [`
    textarea { width:100%; max-width:560px; padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; display:block; margin-bottom:10px; }
    .field { display:flex; flex-direction:column; gap:4px; max-width:320px; margin-bottom:10px; }
    .field label { font-size:12px; font-weight:600; color:#374151; } .req { color:#dc2626; }
    .field input { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; }
    .meta { font-size:12px; color:#6b7280; }
    .resultado { margin-top:12px; padding:12px; border-radius:6px; background:#d1fae5; color:#065f46; font-size:14px; }
    .resultado.alta { background:#fee2e2; color:#991b1b; }
    .error-banner { padding:8px 12px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:13px; margin:10px 0; }
  `]
})
export class PreTriajeComponent implements OnInit {
  private apollo = inject(Apollo);
  private ms2 = inject(Ms2Service);
  private router = inject(Router);

  sintomas = '';
  cargando = false;
  resultado: any = null;
  miPacienteId: string | null = null;
  fechaHora = '';
  guardando = false;
  ok = false;
  error = '';

  ngOnInit() {
    this.apollo.query<any>({ query: MI_PACIENTE, fetchPolicy: 'network-only' })
      .subscribe({ next: r => this.miPacienteId = r.data?.miPaciente?.id ?? null, error: () => {} });
  }

  evaluar() {
    const sintomas = this.sintomas.trim();
    if (!sintomas) return;
    this.cargando = true;
    this.resultado = null;
    this.error = '';
    this.ms2.preTriaje(sintomas).subscribe({
      next: r => {
        this.cargando = false;
        this.resultado = r;
      },
      error: e => {
        this.cargando = false;
        this.error = 'No se pudo evaluar los síntomas: '
          + (e?.error?.detail || e?.message || 'servicio de IA no disponible')
          + '. Verifica que ms-diagnostico-ia esté corriendo.';
      },
    });
  }

  agendar() {
    if (!this.miPacienteId || !this.fechaHora || !this.resultado) return;
    this.guardando = true; this.error = ''; this.ok = false;
    const input = {
      pacienteId: this.miPacienteId,
      especialidad: this.resultado.especialidad,
      urgencia: this.resultado.urgencia,
      fechaHora: new Date(this.fechaHora).toISOString(),
      motivo: this.sintomas
    };
    this.apollo.mutate<any>({ mutation: CREAR_CITA, variables: { input } }).subscribe({
      next: () => { this.guardando = false; this.ok = true; },
      error: e => { this.guardando = false; this.error = e?.graphQLErrors?.[0]?.message || e.message; }
    });
  }

  irACitas() {
    this.router.navigate(['/citas'], { queryParams: { especialidad: this.resultado?.especialidad, urgencia: this.resultado?.urgencia } });
  }
}
