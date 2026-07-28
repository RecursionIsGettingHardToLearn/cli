import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { LIST_PACIENTES, NOTIFICAR_RESULTADO } from '../../core/graphql/queries';
import { Ms2Service } from '../../core/services/ms2.service';

@Component({
  selector: 'app-diagnostico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Diagnóstico IA</h1>

    <div class="card">
      <h3>Analizar estudio</h3>
      <div class="grid2">
        <div class="field"><label>Imagen del estudio <span class="req">*</span></label>
          <input type="file" accept="image/*" (change)="onFile($event)"></div>
        <div class="field"><label>Tipo de estudio</label>
          <select [(ngModel)]="tipoEstudio" [ngModelOptions]="{standalone:true}">
            <option *ngFor="let t of tiposEstudio" [value]="t">{{ t }}</option>
          </select></div>
      </div>
      <div class="field" *ngIf="tipoEstudio === 'Otro'"><label>Especifica el tipo de estudio</label>
        <input [(ngModel)]="tipoEstudioOtro" [ngModelOptions]="{standalone:true}" placeholder="Ej: Mamografía, Endoscopia…"></div>
      <p class="ayuda">La IA analiza la imagen y da una <strong>lectura preliminar</strong>. Es apoyo al médico, no un diagnóstico definitivo.</p>
      <div *ngIf="error" class="error-banner">{{ error }}</div>
      <button class="btn-primary" [disabled]="!file || cargando" (click)="analizar()">
        {{ cargando ? 'Analizando…' : 'Analizar con IA' }}
      </button>

      <div *ngIf="resultado" class="resultado">
        <!-- ============ PARTE 1: SUPERVISADO ============ -->
        <div class="parte">
          <div class="parte-h"><span class="parte-num">Parte 1</span> Machine Learning Supervisado — Clasificación</div>
          <div class="pred">
            <div>
              <div class="pred-label">Clase predicha (zero-shot)</div>
              <div class="pred-clase">{{ resultado.clasificacion }}</div>
            </div>
            <div class="pred-prob">{{ (resultado.probabilidad * 100) | number:'1.0-1' }}%</div>
          </div>
          <div class="clases" *ngIf="resultado.probabilidades?.length">
            <div class="clase-row" *ngFor="let c of resultado.probabilidades; let i = index">
              <span class="clase-nom">{{ c.clase }}</span>
              <div class="barra"><div class="relleno" [class.top]="i===0" [style.width.%]="c.probabilidad * 100"></div></div>
              <span class="clase-pct">{{ (c.probabilidad * 100) | number:'1.0-1' }}%</span>
            </div>
          </div>
        </div>

        <!-- ============ PARTE 2: NO SUPERVISADO ============ -->
        <div class="parte">
          <div class="parte-h"><span class="parte-num">Parte 2</span> Machine Learning No Supervisado — Detección de anomalías</div>
          <div class="anomalia" [class.atipico]="resultado.es_anomalo">
            <div class="anom-top">
              <span class="anom-label">Score de rareza respecto a lo normal</span>
              <span class="anom-verdict" [class.ok]="!resultado.es_anomalo">
                {{ resultado.es_anomalo ? 'ATÍPICO' : 'NORMAL' }}
              </span>
            </div>
            <div class="anom-bar"><div class="anom-fill" [style.width.%]="resultado.score_anomalia * 100"></div></div>
            <div class="anom-meta">Score de anomalía: {{ (resultado.score_anomalia * 100) | number:'1.0-1' }}%
              <span *ngIf="resultado.justificacion_anomalia">· {{ resultado.justificacion_anomalia }}</span>
            </div>
          </div>
        </div>

        <!-- ============ APOYO ============ -->
        <div class="detalle">
          <span class="badge" [class.badge-red]="resultado.urgencia==='ALTA'" [class.badge-amber]="resultado.urgencia==='MEDIA'" [class.badge-green]="resultado.urgencia==='BAJA'">Urgencia: {{ resultado.urgencia }}</span>
          <span class="meta">vía {{ resultado.proveedor }} · {{ resultado.tipo_imagen }}</span>
        </div>
        <ul class="hallazgos" *ngIf="resultado.hallazgos?.length">
          <li *ngFor="let h of resultado.hallazgos">{{ h }}</li>
        </ul>
        <p class="reco"><strong>Recomendación:</strong> {{ resultado.recomendacion }}</p>
      </div>
    </div>

    <!-- ============ NOTIFICAR AL PACIENTE (tras el resultado) ============ -->
    <div class="card" *ngIf="resultado">
      <h3>Notificar resultado al paciente</h3>
      <p class="ayuda">Si quieres, elige el paciente y envíale una notificación push de que su resultado ya está disponible.</p>
      <div class="notif-row">
        <div class="field" style="margin:0; flex:1;">
          <label>Paciente</label>
          <select [(ngModel)]="pacienteId" [ngModelOptions]="{standalone:true}" (change)="cargarDiag()">
            <option [ngValue]="null">— Seleccionar paciente —</option>
            <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
          </select>
        </div>
        <button class="btn-primary" [disabled]="!pacienteId || notificando" (click)="notificar()">
          <i class="pi pi-bell"></i> {{ notificando ? 'Enviando…' : 'Enviar notificación' }}
        </button>
      </div>
      <p *ngIf="notifMsg" class="notif-msg">{{ notifMsg }}</p>
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
    .ayuda { font-size:12px; color:#6b7280; margin:10px 0 4px; }
    .field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; max-width:480px; }
    .field label { font-size:12px; font-weight:600; color:#374151; } .req { color:#dc2626; }
    .field input, .field select { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; background:#fff; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:480px; }
    .error-banner { padding:8px 12px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:13px; margin:10px 0; }
    .resultado { margin-top:14px; font-size:14px; color:#1f2937; }
    .parte { padding:14px 16px; border-radius:8px; background:#f8fafc; border:1px solid #e5e7eb; margin-bottom:12px; }
    .parte-h { font-size:13px; font-weight:700; color:#0f6e56; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e5e7eb; }
    .parte-num { background:#0f6e56; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; margin-right:8px; }
    .pred { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .pred-label { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
    .pred-clase { font-size:20px; font-weight:700; color:#0f6e56; }
    .pred-prob { font-size:26px; font-weight:700; color:#0f6e56; }
    .clases { display:flex; flex-direction:column; gap:6px; }
    .clase-row { display:grid; grid-template-columns:150px 1fr 48px; align-items:center; gap:8px; font-size:12.5px; }
    .clase-nom { color:#374151; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .barra { background:#e5e7eb; border-radius:999px; height:10px; overflow:hidden; }
    .relleno { height:100%; background:#9ca3af; border-radius:999px; transition:width .4s ease; }
    .relleno.top { background:#0f6e56; }
    .clase-pct { text-align:right; font-variant-numeric:tabular-nums; color:#374151; }
    .anomalia { padding:12px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; }
    .anomalia.atipico { background:#fef2f2; border-color:#fecaca; }
    .anom-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .anom-label { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
    .anom-verdict { font-size:12px; font-weight:700; padding:2px 10px; border-radius:999px; background:#fee2e2; color:#991b1b; }
    .anom-verdict.ok { background:#dcfce7; color:#166534; }
    .anom-bar { background:#e5e7eb; border-radius:999px; height:10px; overflow:hidden; }
    .anom-fill { height:100%; background:#16a34a; border-radius:999px; transition:width .4s ease; }
    .anomalia.atipico .anom-fill { background:#dc2626; }
    .anom-meta { font-size:12px; color:#4b5563; margin-top:6px; }
    .detalle { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    .hallazgos { margin:6px 0; padding-left:18px; font-size:13px; color:#4b5563; }
    .hallazgos li { margin:2px 0; }
    .reco { font-size:13px; margin:8px 0 0; }
    .notif-row { display:flex; gap:12px; align-items:flex-end; max-width:640px; }
    .notif-msg { font-size:13px; margin-top:10px; color:#374151; }
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
  tipoEstudio = 'Radiografía';
  tipoEstudioOtro = '';
  tiposEstudio = ['Radiografía', 'Tomografía (TC)', 'Ecografía', 'Resonancia (RM)', 'Lesión dermatológica', 'Informe / documento', 'Otro'];
  cargando = false;
  error = '';
  resultado: any = null;
  diagnosticos: any[] = [];
  pretriajes: any[] = [];
  notificando = false;
  notifMsg = '';

  ngOnInit() {
    this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
      .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file = input.files && input.files.length ? input.files[0] : null;
  }

  private tipoFinal(): string {
    return this.tipoEstudio === 'Otro' ? (this.tipoEstudioOtro.trim() || 'estudio clínico') : this.tipoEstudio;
  }

  analizar() {
    if (!this.file) return;
    this.cargando = true;
    this.error = '';
    this.resultado = null;
    this.notifMsg = '';

    const fd = new FormData();
    fd.append('file', this.file);
    // Se analiza SIN paciente; el paciente se elige después, solo para notificar.
    fd.append('descripcion', this.tipoFinal());

    this.ms2.diagnosticar(fd).subscribe({
      next: r => {
        this.cargando = false;
        this.resultado = {
          id: r.resultado_id,
          clasificacion: r.clasificacion,
          probabilidad: r.probabilidad ?? 0,
          probabilidades: r.probabilidades ?? [],
          score_anomalia: r.score_anomalia ?? 0,
          es_anomalo: r.es_anomalo ?? false,
          justificacion_anomalia: r.justificacion_anomalia ?? '',
          hallazgos: r.hallazgos ?? [],
          urgencia: r.urgencia,
          recomendacion: r.recomendacion,
          proveedor: r.proveedor,
          tipo_imagen: r.tipo_imagen,
        };
      },
      error: e => {
        this.cargando = false;
        this.error = e?.error?.detail || e.message || 'Error al analizar la imagen';
      }
    });
  }

  notificar() {
    if (!this.pacienteId) return;
    this.notificando = true;
    this.notifMsg = '';
    this.apollo.mutate<any>({ mutation: NOTIFICAR_RESULTADO, variables: { pacienteId: this.pacienteId, tipoEstudio: this.tipoFinal() } })
      .subscribe({
        next: r => {
          this.notificando = false;
          this.notifMsg = r.data?.notificarResultado
            ? '✅ Notificación enviada al paciente.'
            : '⚠️ El paciente no tiene la app con notificaciones activadas (sin token push).';
        },
        error: e => { this.notificando = false; this.notifMsg = 'Error: ' + (e.message || 'no se pudo notificar'); }
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
