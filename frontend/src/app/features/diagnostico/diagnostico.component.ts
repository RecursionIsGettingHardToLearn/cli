import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { LIST_PACIENTES } from '../../core/graphql/queries';
import { Ms2Service } from '../../core/services/ms2.service';

@Component({
  selector: 'app-diagnostico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Diagnóstico IA</h1>

    <div class="card">
      <h3>Analizar estudio</h3>
      <div class="field">
        <label>Paciente <span class="req">*</span></label>
        <select [(ngModel)]="pacienteId" [ngModelOptions]="{standalone:true}" (change)="cargarDiag()">
          <option [ngValue]="null">— Seleccionar —</option>
          <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
        </select>
      </div>
      <div class="grid2">
        <div class="field"><label>Imagen del estudio <span class="req">*</span></label>
          <input type="file" accept="image/*" (change)="onFile($event)"></div>
        <div class="field"><label>Modelo</label>
          <select [(ngModel)]="modo" [ngModelOptions]="{standalone:true}">
            <option value="SUPERVISADO">Supervisado (clasificación)</option>
            <option value="NO_SUPERVISADO">No supervisado (anomalías)</option>
          </select></div>
      </div>
      <div class="field"><label>Tipo de estudio</label>
        <input [(ngModel)]="tipoEstudio" [ngModelOptions]="{standalone:true}" placeholder="radiografia"></div>
      <div *ngIf="error" class="error-banner">{{ error }}</div>
      <button class="btn-primary" [disabled]="!pacienteId || !file || cargando" (click)="analizar()">
        {{ cargando ? 'Analizando…' : 'Analizar con IA' }}
      </button>

      <div *ngIf="resultado" class="resultado" [class.alerta]="resultado.hallazgo==='anomalo' || resultado.hallazgo==='atipico'">
        <strong>Sugerencia IA:</strong> {{ resultado.hallazgo }}
        · confianza {{ (resultado.confianza * 100) | number:'1.0-1' }}%
        · <span class="badge">{{ resultado.modo }}</span>
        <span class="meta">modelo {{ resultado.modelo_version }}</span>
      </div>
    </div>

    <div class="card" *ngIf="pacienteId">
      <h3>Apoyo del pre-triaje</h3>
      <div *ngIf="pretriajes.length; else sinPretriaje">
        <div class="triage" *ngFor="let t of pretriajes.slice(0, 2)">
          <strong>{{ t.especialidad }}</strong>
          <span class="badge" [class.badge-red]="t.urgencia === 'ALTA'" [class.badge-amber]="t.urgencia === 'MEDIA'">{{ t.urgencia }}</span>
          <p>{{ t.respuesta }}</p>
          <div class="meta">confianza {{ (t.confianza * 100) | number:'1.0-1' }}% · {{ t.created_at | date:'short' }}</div>
        </div>
      </div>
      <ng-template #sinPretriaje>
        <p class="empty">Sin pre-triaje registrado para este paciente.</p>
      </ng-template>
    </div>

    <div class="card" *ngIf="pacienteId">
      <h3>Diagnósticos del paciente</h3>
      <table class="tabla" *ngIf="diagnosticos.length">
        <tr><th>Fecha</th><th>Estudio</th><th>Hallazgo</th><th>Confianza</th><th>Estado</th><th>Acción médica</th></tr>
        <tr *ngFor="let d of diagnosticos">
          <td>{{ d.created_at | date:'short' }}</td><td>{{ d.tipo_estudio }}</td>
          <td>
            {{ d.hallazgo }}
            <div class="meta" *ngIf="d.recomendacion">{{ d.recomendacion }}</div>
          </td>
          <td>{{ (d.confianza*100) | number:'1.0-1' }}%</td>
          <td><span class="badge" [class.badge-green]="d.estado_revision === 'CONFIRMADO'" [class.badge-red]="d.estado_revision === 'DESCARTADO'">{{ d.estado_revision }}</span></td>
          <td>
            <button class="btn-mini" (click)="revisar(d, 'CONFIRMADO')" [disabled]="d.estado_revision === 'CONFIRMADO'">Confirmar</button>
            <button class="btn-mini btn-danger" (click)="revisar(d, 'DESCARTADO')" [disabled]="d.estado_revision === 'DESCARTADO'">Descartar</button>
          </td>
        </tr>
      </table>
      <p *ngIf="diagnosticos.length === 0" class="empty">Sin diagnósticos.</p>
    </div>
  `,
  styles: [`
    .field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; max-width:480px; }
    .field label { font-size:12px; font-weight:600; color:#374151; } .req { color:#dc2626; }
    .field input, .field select { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; background:#fff; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:480px; }
    .error-banner { padding:8px 12px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:13px; margin:10px 0; }
    .resultado { margin-top:14px; padding:12px; border-radius:6px; background:#d1fae5; color:#065f46; font-size:14px; }
    .resultado.alerta { background:#fef3c7; color:#92400e; }
    .badge { font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; background:#e5e7eb; color:#374151; }
    .badge-green { background:#d1fae5; color:#065f46; }
    .badge-red { background:#fee2e2; color:#991b1b; }
    .badge-amber { background:#fef3c7; color:#92400e; }
    .meta { margin-left:8px; font-size:11px; color:#6b7280; }
    .triage { border:1px solid #e5e7eb; border-radius:6px; padding:10px; margin-bottom:8px; }
    .triage p { margin:6px 0; font-size:13px; color:#374151; }
    .btn-mini { border:1px solid #0f6e56; color:#0f6e56; background:#fff; border-radius:4px; padding:4px 8px; margin-right:4px; cursor:pointer; font-size:12px; }
    .btn-mini:disabled { opacity:.45; cursor:not-allowed; }
    .btn-danger { border-color:#991b1b; color:#991b1b; }
    .tabla { width:100%; border-collapse:collapse; font-size:13px; }
    .tabla th, .tabla td { text-align:left; padding:6px 8px; border-bottom:1px solid #e5e7eb; }
    .empty { color:#6b7280; text-align:center; padding:16px; }
  `]
})
export class DiagnosticoComponent implements OnInit {
  private apollo = inject(Apollo);
  private ms2 = inject(Ms2Service);

  pacientes: any[] = [];
  pacienteId: string | null = null;
  file: File | null = null;
  modo = 'SUPERVISADO';
  tipoEstudio = 'radiografia';
  cargando = false;
  error = '';
  resultado: any = null;
  diagnosticos: any[] = [];
  pretriajes: any[] = [];

  ngOnInit() {
    this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
      .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file = input.files && input.files.length ? input.files[0] : null;
  }

  analizar() {
    if (!this.file || !this.pacienteId) return;
    this.cargando = true;
    this.error = '';
    this.resultado = null;

    const fd = new FormData();
    fd.append('file', this.file);
    fd.append('paciente_id', this.pacienteId);
    fd.append('descripcion', `${this.tipoEstudio} · modo ${this.modo}`);

    this.ms2.diagnosticar(fd).subscribe({
      next: r => {
        this.cargando = false;
        this.resultado = {
          id: r.resultado_id,
          hallazgo: r.hallazgos?.join(' · ') || r.recomendacion,
          confianza: r.confianza ?? 0,
          modo: r.proveedor,
          modelo_version: r.tipo_imagen,
        };
        this.cargarDiag();
      },
      error: e => {
        this.cargando = false;
        this.error = e?.error?.detail || e.message || 'Error al analizar la imagen';
      }
    });
  }

  cargarDiag() {
    if (!this.pacienteId) { this.diagnosticos = []; this.pretriajes = []; return; }
    this.ms2.listarDiagnosticos(this.pacienteId).subscribe({
      next: r => {
        const rows = r ?? [];
        this.diagnosticos = rows
          .filter((x: any) => x.tipo === 'analisis_imagen')
          .map((x: any) => ({
            id: x.id,
            created_at: x.creado_en,
            tipo_estudio: x.resultado?.tipo_imagen ?? 'imagen',
            hallazgo: x.resultado?.hallazgos?.join(' · ') ?? x.resultado?.recomendacion ?? 'sin hallazgos',
            recomendacion: x.resultado?.recomendacion,
            confianza: x.resultado?.confianza ?? 0,
            modo: x.proveedor,
            estado_revision: x.estado_revision ?? 'PENDIENTE',
          }));
        this.pretriajes = rows
          .filter((x: any) => x.tipo === 'chat_triaje')
          .map((x: any) => ({
            created_at: x.creado_en,
            respuesta: x.resultado?.respuesta,
            especialidad: x.resultado?.especialidad,
            urgencia: x.resultado?.urgencia,
            confianza: x.resultado?.confianza ?? 0,
          }));
      },
      error: () => { this.diagnosticos = []; this.pretriajes = []; }
    });
  }

  revisar(d: any, estado: 'CONFIRMADO' | 'DESCARTADO') {
    const decision = estado === 'CONFIRMADO'
      ? 'El medico confirma la sugerencia de IA como apoyo clinico.'
      : 'El medico descarta la sugerencia de IA segun criterio profesional.';
    this.ms2.revisarResultado(d.id, estado, decision).subscribe({
      next: r => {
        d.estado_revision = r.estado_revision;
      },
      error: e => this.error = e?.error?.detail || e.message || 'Error al revisar resultado'
    });
  }
}
