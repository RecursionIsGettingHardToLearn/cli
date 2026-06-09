import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { take } from 'rxjs';
import { LIST_PACIENTES, MI_PACIENTE } from '../../core/graphql/queries';
import { SupabaseService } from '../../core/auth/supabase.service';
import { Ms2Service } from '../../core/services/ms2.service';

@Component({
  selector: 'app-documentos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Documentos clínicos</h1>

    <div class="card" *ngIf="!esPaciente">
      <div class="field">
        <label>Paciente</label>
        <select [(ngModel)]="pacienteId" [ngModelOptions]="{standalone:true}" (change)="cargar()">
          <option [ngValue]="null">— Seleccionar —</option>
          <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
        </select>
      </div>
    </div>

    <div class="card" *ngIf="pacienteId">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Subir documento</h3>
        <button class="btn-primary" (click)="showForm=!showForm"><i class="pi pi-upload"></i> Subir</button>
      </div>
      <div *ngIf="showForm" class="form-block">
        <div class="field"><label>Archivo <span class="req">*</span></label>
          <input type="file" (change)="onFile($event)"></div>
        <div class="grid2">
          <div class="field"><label>Tipo</label><input [(ngModel)]="form.tipo" [ngModelOptions]="{standalone:true}" placeholder="estudio / receta / informe"></div>
          <div class="field"><label>Motivo (si es corrección)</label><input [(ngModel)]="form.motivo" [ngModelOptions]="{standalone:true}" placeholder="opcional"></div>
        </div>
        <div *ngIf="error" class="error-banner">{{ error }}</div>
        <button class="btn-primary" [disabled]="!file || subiendo" (click)="subir()">{{ subiendo ? 'Subiendo…' : 'Guardar documento' }}</button>
      </div>
    </div>

    <div class="card" *ngIf="pacienteId">
      <h3>Documentos cargados</h3>
      <div *ngFor="let d of documentos" class="doc">
        <div style="display:flex; justify-content:space-between;">
          <div>
            <strong>{{ d.nombre_original }}</strong>
            <span class="badge" *ngIf="d.content_type">{{ d.content_type }}</span>
            <span class="meta">{{ d.creado_en | date:'short' }}</span>
          </div>
          <div>
            <button class="btn-link" (click)="verAuditoria(d)">Ver resultado IA</button>
          </div>
        </div>
        <div class="meta">documento IA #{{ d.id }} · {{ d.tamano_bytes }} bytes</div>

        <div *ngIf="auditorias[d.id]" class="sub">
          <strong>Resultado:</strong>
          <pre>{{ auditorias[d.id] | json }}</pre>
        </div>
      </div>
      <p *ngIf="documentos.length === 0" class="empty">Sin documentos.</p>
    </div>

    <div class="card" *ngIf="esPaciente && !pacienteId">
      <p class="empty">No encontramos tu ficha de paciente vinculada a tu cuenta.</p>
    </div>
  `,
  styles: [`
    .field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; max-width:480px; }
    .field label { font-size:12px; font-weight:600; color:#374151; } .req { color:#dc2626; }
    .field input, .field select { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; background:#fff; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:480px; }
    .form-block { padding:14px; background:#f9fafb; border-radius:6px; margin-top:10px; }
    .error-banner { padding:8px 12px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:13px; margin:10px 0; }
    .doc { padding:12px; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:10px; }
    .badge { font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; background:#e5e7eb; color:#374151; margin-left:6px; }
    .badge-green { background:#d1fae5; color:#065f46; }
    .meta { font-size:11px; color:#6b7280; margin-left:6px; }
    .btn-link { background:none; border:none; color:#0f6e56; cursor:pointer; text-decoration:underline; font-size:12px; margin-left:8px; }
    .link { color:#0f6e56; cursor:pointer; text-decoration:underline; }
    .sub { margin-top:8px; padding:8px; background:#f9fafb; border-radius:4px; font-size:12px; color:#374151; }
    .empty { color:#6b7280; text-align:center; padding:16px; }
  `]
})
export class DocumentosComponent implements OnInit {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);
  private ms2 = inject(Ms2Service);

  esPaciente = false;
  pacientes: any[] = [];
  pacienteId: string | null = null;
  documentos: any[] = [];
  auditorias: Record<string, any[]> = {};
  file: File | null = null;
  showForm = false;
  subiendo = false;
  error = '';
  form = { tipo: 'estudio', motivo: '' };

  ngOnInit() {
    this.supabase.role$.pipe(take(1)).subscribe(rol => {
      this.esPaciente = rol === 'PACIENTE';
      if (this.esPaciente) {
        this.apollo.query<any>({ query: MI_PACIENTE, fetchPolicy: 'network-only' }).subscribe({
          next: r => { this.pacienteId = r.data?.miPaciente?.id ?? null; if (this.pacienteId) this.cargar(); },
          error: () => {}
        });
      } else {
        this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
          .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
      }
    });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file = input.files && input.files.length ? input.files[0] : null;
  }

  cargar() {
    this.auditorias = {};
    if (!this.pacienteId) { this.documentos = []; return; }
    this.ms2.listarDocumentos(this.pacienteId).subscribe({
      next: r => this.documentos = r ?? [], error: () => this.documentos = []
    });
  }

  subir() {
    if (!this.file || !this.pacienteId) return;
    this.subiendo = true; this.error = '';
    const fd = new FormData();
    fd.append('file', this.file);
    fd.append('paciente_id', this.pacienteId);
    fd.append('descripcion', this.form.motivo || this.form.tipo || 'documento clinico');
    this.ms2.subirDocumento(fd).subscribe({
      next: () => {
        this.subiendo = false; this.showForm = false; this.file = null;
        this.form = { tipo: 'estudio', motivo: '' };
        this.cargar();
      },
      error: e => { this.subiendo = false; this.error = e?.error?.detail || e.message || 'Error al subir'; }
    });
  }

  verAuditoria(d: any) {
    this.auditorias[d.id] = d;
  }
}
