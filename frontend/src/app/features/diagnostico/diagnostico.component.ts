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

    <!-- ==================== SUPERVISADO ==================== -->
    <div class="card">
      <div class="titulo">
        <span class="parte-num">Supervisado</span>
        <h3>Clasificación de la imagen</h3>
      </div>
      <p class="ayuda">Predice a qué clase pertenece el estudio y con qué probabilidad. Apoyo al médico, no diagnóstico definitivo.</p>
      <div class="grid2">
        <div class="field"><label>Imagen del estudio <span class="req">*</span></label>
          <input type="file" accept="image/*" (change)="onFileSup($event)"></div>
        <div class="field"><label>Tipo de estudio</label>
          <select [(ngModel)]="tipoSup" [ngModelOptions]="{standalone:true}">
            <option *ngFor="let t of tiposEstudio" [value]="t">{{ t }}</option>
          </select></div>
      </div>
      <div class="field" *ngIf="tipoSup === 'Otro'"><label>Especifica el tipo</label>
        <input [(ngModel)]="tipoSupOtro" [ngModelOptions]="{standalone:true}" placeholder="Ej: Mamografía…"></div>
      <div *ngIf="errorSup" class="error-banner">{{ errorSup }}</div>
      <button class="btn-primary" [disabled]="!fileSup || cargandoSup" (click)="analizarSup()">
        {{ cargandoSup ? 'Clasificando…' : 'Clasificar con IA' }}
      </button>

      <div *ngIf="resSup" class="resultado">
        <div class="parte">
          <div class="pred">
            <div>
              <div class="pred-label">Clase predicha (zero-shot)</div>
              <div class="pred-clase">{{ resSup.clasificacion }}</div>
            </div>
            <div class="pred-prob">{{ (resSup.probabilidad * 100) | number:'1.0-1' }}%</div>
          </div>
          <div class="clases" *ngIf="resSup.probabilidades?.length">
            <div class="clase-row" *ngFor="let c of resSup.probabilidades; let i = index">
              <span class="clase-nom">{{ c.clase }}</span>
              <div class="barra"><div class="relleno" [class.top]="i===0" [style.width.%]="c.probabilidad * 100"></div></div>
              <span class="clase-pct">{{ (c.probabilidad * 100) | number:'1.0-1' }}%</span>
            </div>
          </div>
        </div>
        <div class="detalle">
          <span class="badge" [class.badge-red]="resSup.urgencia==='ALTA'" [class.badge-amber]="resSup.urgencia==='MEDIA'" [class.badge-green]="resSup.urgencia==='BAJA'">Urgencia: {{ resSup.urgencia }}</span>
          <span class="meta">vía {{ resSup.proveedor }} · {{ resSup.tipo_imagen }}</span>
        </div>
        <ul class="hallazgos" *ngIf="resSup.hallazgos?.length">
          <li *ngFor="let h of resSup.hallazgos">{{ h }}</li>
        </ul>
        <p class="reco"><strong>Recomendación:</strong> {{ resSup.recomendacion }}</p>
      </div>
    </div>

    <!-- ==================== NO SUPERVISADO ==================== -->
    <div class="card">
      <div class="titulo">
        <span class="parte-num alt">No supervisado</span>
        <h3>Detección de anomalías</h3>
      </div>
      <p class="ayuda">Mide qué tan atípica es la imagen respecto a lo normal, sin clases predefinidas.</p>
      <div class="grid2">
        <div class="field"><label>Imagen del estudio <span class="req">*</span></label>
          <input type="file" accept="image/*" (change)="onFileNoSup($event)"></div>
        <div class="field"><label>Tipo de estudio</label>
          <select [(ngModel)]="tipoNoSup" [ngModelOptions]="{standalone:true}">
            <option *ngFor="let t of tiposEstudio" [value]="t">{{ t }}</option>
          </select></div>
      </div>
      <div class="field" *ngIf="tipoNoSup === 'Otro'"><label>Especifica el tipo</label>
        <input [(ngModel)]="tipoNoSupOtro" [ngModelOptions]="{standalone:true}" placeholder="Ej: Mamografía…"></div>
      <div *ngIf="errorNoSup" class="error-banner">{{ errorNoSup }}</div>
      <button class="btn-primary" [disabled]="!fileNoSup || cargandoNoSup" (click)="analizarNoSup()">
        {{ cargandoNoSup ? 'Analizando…' : 'Detectar anomalías con IA' }}
      </button>

      <div *ngIf="resNoSup" class="resultado">
        <div class="anomalia" [class.atipico]="resNoSup.es_anomalo">
          <div class="anom-top">
            <span class="anom-label">Score de rareza respecto a lo normal</span>
            <span class="anom-verdict" [class.ok]="!resNoSup.es_anomalo">
              {{ resNoSup.es_anomalo ? 'ATÍPICO' : 'NORMAL' }}
            </span>
          </div>
          <div class="anom-bar"><div class="anom-fill" [style.width.%]="resNoSup.score_anomalia * 100"></div></div>
          <div class="anom-meta">Score de anomalía: {{ (resNoSup.score_anomalia * 100) | number:'1.0-1' }}%
            <span *ngIf="resNoSup.justificacion_anomalia">· {{ resNoSup.justificacion_anomalia }}</span>
          </div>
        </div>
        <span class="meta" style="margin-left:0;">vía {{ resNoSup.proveedor }} · {{ resNoSup.tipo_imagen }}</span>
      </div>
    </div>

    <!-- ==================== NOTIFICAR ==================== -->
    <div class="card" *ngIf="resSup || resNoSup">
      <h3>Notificar resultado al paciente</h3>
      <p class="ayuda">Elige el paciente, escribe el mensaje y envíale una notificación push. Puedes editar el título y el texto que le llegará.</p>
      <div class="field" style="max-width:640px;">
        <label>Título de la notificación</label>
        <input [(ngModel)]="notifTitulo" [ngModelOptions]="{standalone:true}" maxlength="80" placeholder="Resultado disponible 📋">
      </div>
      <div class="field" style="max-width:640px;">
        <label>Mensaje para el paciente</label>
        <textarea [(ngModel)]="notifMensaje" [ngModelOptions]="{standalone:true}" rows="3" maxlength="300"
                  placeholder="Ej: Tu radiografía ya fue revisada. Por favor comunícate con la clínica para agendar seguimiento."></textarea>
        <span class="hint">{{ notifMensaje.length }}/300 · esto es exactamente lo que verá el paciente.</span>
      </div>
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
    .titulo { display:flex; align-items:center; gap:10px; margin-bottom:2px; }
    .titulo h3 { margin:0; }
    .parte-num { background:#0f6e56; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:4px; text-transform:uppercase; letter-spacing:.5px; }
    .parte-num.alt { background:#7c3aed; }
    .ayuda { font-size:12px; color:#6b7280; margin:6px 0 12px; }
    .field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; max-width:480px; }
    .field label { font-size:12px; font-weight:600; color:#374151; } .req { color:#dc2626; }
    .field input, .field select { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; background:#fff; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:480px; }
    .error-banner { padding:8px 12px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:13px; margin:10px 0; }
    .resultado { margin-top:14px; font-size:14px; color:#1f2937; }
    .parte { padding:14px 16px; border-radius:8px; background:#f8fafc; border:1px solid #e5e7eb; margin-bottom:12px; }
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
    .field textarea { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font:inherit; font-size:14px; resize:vertical; }
    .hint { font-size:11px; color:#6b7280; }
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

  tiposEstudio = ['Radiografía', 'Tomografía (TC)', 'Ecografía', 'Resonancia (RM)', 'Lesión dermatológica', 'Informe / documento', 'Otro'];

  // --- Supervisado (independiente) ---
  fileSup: File | null = null;
  tipoSup = 'Radiografía';
  tipoSupOtro = '';
  cargandoSup = false;
  errorSup = '';
  resSup: any = null;

  // --- No supervisado (independiente) ---
  fileNoSup: File | null = null;
  tipoNoSup = 'Radiografía';
  tipoNoSupOtro = '';
  cargandoNoSup = false;
  errorNoSup = '';
  resNoSup: any = null;

  // --- Compartido ---
  pacientes: any[] = [];
  pacienteId: string | null = null;
  diagnosticos: any[] = [];
  pretriajes: any[] = [];
  notificando = false;
  notifMsg = '';
  notifTitulo = 'Resultado disponible 📋';
  notifMensaje = 'Tu resultado ya fue revisado. Por favor comunícate con la clínica para el seguimiento.';
  private notifTipo = 'estudio';

  ngOnInit() {
    this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
      .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
  }

  onFileSup(ev: Event) { this.fileSup = this.pickFile(ev); }
  onFileNoSup(ev: Event) { this.fileNoSup = this.pickFile(ev); }
  private pickFile(ev: Event): File | null {
    const input = ev.target as HTMLInputElement;
    return input.files && input.files.length ? input.files[0] : null;
  }

  private tipoDe(tipo: string, otro: string): string {
    return tipo === 'Otro' ? (otro.trim() || 'estudio clínico') : tipo;
  }

  private analizarImagen(file: File, tipo: string) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('descripcion', tipo);
    return this.ms2.diagnosticar(fd);
  }

  analizarSup() {
    if (!this.fileSup) return;
    const tipo = this.tipoDe(this.tipoSup, this.tipoSupOtro);
    this.cargandoSup = true; this.errorSup = ''; this.resSup = null;
    this.analizarImagen(this.fileSup, tipo).subscribe({
      next: r => {
        this.cargandoSup = false;
        this.resSup = {
          clasificacion: r.clasificacion,
          probabilidad: r.probabilidad ?? 0,
          probabilidades: r.probabilidades ?? [],
          urgencia: r.urgencia,
          hallazgos: r.hallazgos ?? [],
          recomendacion: r.recomendacion,
          proveedor: r.proveedor,
          tipo_imagen: r.tipo_imagen,
        };
        this.notifTipo = tipo;
      },
      error: e => { this.cargandoSup = false; this.errorSup = e?.error?.detail || e.message || 'Error al clasificar la imagen'; }
    });
  }

  analizarNoSup() {
    if (!this.fileNoSup) return;
    const tipo = this.tipoDe(this.tipoNoSup, this.tipoNoSupOtro);
    this.cargandoNoSup = true; this.errorNoSup = ''; this.resNoSup = null;
    this.analizarImagen(this.fileNoSup, tipo).subscribe({
      next: r => {
        this.cargandoNoSup = false;
        this.resNoSup = {
          score_anomalia: r.score_anomalia ?? 0,
          es_anomalo: r.es_anomalo ?? false,
          justificacion_anomalia: r.justificacion_anomalia ?? '',
          proveedor: r.proveedor,
          tipo_imagen: r.tipo_imagen,
        };
        this.notifTipo = tipo;
      },
      error: e => { this.cargandoNoSup = false; this.errorNoSup = e?.error?.detail || e.message || 'Error al detectar anomalías'; }
    });
  }

  notificar() {
    if (!this.pacienteId) return;
    this.notificando = true;
    this.notifMsg = '';
    this.apollo.mutate<any>({ mutation: NOTIFICAR_RESULTADO, variables: { pacienteId: this.pacienteId, tipoEstudio: this.notifTipo, titulo: this.notifTitulo.trim() || null, mensaje: this.notifMensaje.trim() || null } })
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
      next: r => { d.estado_revision = r.estado_revision; },
      error: e => this.errorSup = e?.error?.detail || e.message || 'Error al revisar resultado'
    });
  }
}
