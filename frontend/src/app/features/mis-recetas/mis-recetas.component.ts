import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { take } from 'rxjs';
import { MIS_RECETAS, MIS_RECETAS_PACIENTE, LIST_PACIENTES, LIST_MEDICAMENTOS, EMITIR_RECETA, VERIFICAR_RECETA } from '../../core/graphql/queries';
import { SupabaseService } from '../../core/auth/supabase.service';
import { SaldoBlockchainComponent } from '../saldo-blockchain/saldo-blockchain.component';

@Component({
  selector: 'app-mis-recetas',
  standalone: true,
  imports: [CommonModule, FormsModule, SaldoBlockchainComponent],
  template: `
    <h1 class="page-title">{{ esMedico ? 'Mis recetas (Médico)' : 'Mis recetas' }}</h1>

    <!-- Saldo de POL en Polygon Amoy (solo MEDICO: es quien registra y gasta gas) -->
    <app-saldo-blockchain *ngIf="esMedico"></app-saldo-blockchain>

    <!-- Formulario emitir - solo MEDICO -->
    <div class="card" *ngIf="esMedico">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Nueva receta</h3>
        <button (click)="showForm = !showForm" class="btn-primary">
          <i class="pi pi-plus"></i> Emitir receta
        </button>
      </div>

      <form *ngIf="showForm" #recForm="ngForm" (ngSubmit)="emitir(recForm)" class="form-block" novalidate>
        <div class="field">
          <label for="rec-paciente">Paciente <span class="req">*</span></label>
          <select id="rec-paciente" name="paciente" [(ngModel)]="form.pacienteId" required
                  #pCtrl="ngModel"
                  [class.invalid]="pCtrl.invalid && (pCtrl.dirty || pCtrl.touched)">
            <option [ngValue]="null">— Seleccionar paciente —</option>
            <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
          </select>
          <small class="error" *ngIf="pCtrl.invalid && (pCtrl.dirty || pCtrl.touched)">
            Debes seleccionar un paciente.
          </small>
        </div>

        <div class="field">
          <label for="rec-diag">Diagnóstico</label>
          <textarea id="rec-diag" name="diag" [(ngModel)]="form.diagnostico"
                    rows="2" maxlength="500"
                    placeholder="Diagnóstico que justifica la prescripción (opcional, máx 500 caracteres)"></textarea>
        </div>

        <div class="items-header">
          <h4>Medicamentos recetados <span class="req">*</span></h4>
          <button type="button" (click)="agregarItem()" class="btn-secondary">
            <i class="pi pi-plus"></i> Agregar medicamento
          </button>
        </div>

        <p *ngIf="form.detalles.length === 0" class="empty-items">
          Sin medicamentos. Agrega al menos uno para emitir la receta.
        </p>

        <div *ngFor="let it of form.detalles; let i = index" class="item-card">
          <div class="item-grid">
            <div class="field">
              <label [attr.for]="'rec-med-' + i">Medicamento <span class="req">*</span></label>
              <select [id]="'rec-med-' + i" [name]="'m' + i" [(ngModel)]="it.medicamentoId" required
                      #mCtrl="ngModel"
                      [class.invalid]="mCtrl.invalid && (mCtrl.dirty || mCtrl.touched)">
                <option [ngValue]="null">— Seleccionar —</option>
                <option *ngFor="let m of medicamentos" [ngValue]="m.id">
                  {{ m.nombre }}{{ m.controlado ? ' (controlado)' : '' }}
                </option>
              </select>
              <small class="error" *ngIf="mCtrl.invalid && (mCtrl.dirty || mCtrl.touched)">Medicamento requerido.</small>
            </div>

            <div class="field" style="max-width: 110px;">
              <label [attr.for]="'rec-cant-' + i">Cantidad <span class="req">*</span></label>
              <input [id]="'rec-cant-' + i" [name]="'c' + i" type="number" min="1" step="1"
                     [(ngModel)]="it.cantidad" required
                     #cCtrl="ngModel"
                     [class.invalid]="cCtrl.invalid && (cCtrl.dirty || cCtrl.touched)">
              <small class="error" *ngIf="cCtrl.invalid && (cCtrl.dirty || cCtrl.touched)">Mínimo 1.</small>
            </div>

            <div class="field">
              <label [attr.for]="'rec-pos-' + i">Posología</label>
              <input [id]="'rec-pos-' + i" [name]="'p' + i" type="text"
                     [(ngModel)]="it.posologia" maxlength="200"
                     placeholder="Ej: 1 comprimido cada 8 horas por 7 días">
            </div>

            <button type="button" (click)="form.detalles.splice(i,1)"
                    class="btn-icon" title="Quitar medicamento" style="align-self: end;">
              <i class="pi pi-times"></i>
            </button>
          </div>
        </div>

        <div *ngIf="emitError" class="error-banner">{{ emitError }}</div>

        <div class="form-actions">
          <button type="button" class="btn-secondary" (click)="showForm = false">Cancelar</button>
          <button type="submit" class="btn-primary"
                  [disabled]="recForm.invalid || form.detalles.length === 0 || emitiendo">
            {{ emitiendo ? 'Emitiendo…' : 'Emitir receta' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Lista de recetas (ambos roles) -->
    <div class="card">
      <h3>{{ esMedico ? 'Recetas emitidas' : 'Recetas que me han emitido' }}</h3>
      <div *ngFor="let r of recetas" class="receta-card">
        <div style="display:flex; justify-content: space-between;">
          <div>
            <strong *ngIf="esMedico">{{ r.paciente?.nombre }} {{ r.paciente?.apellido }}</strong>
            <strong *ngIf="!esMedico">{{ r.medicoNombre }}</strong>
            <span class="meta">{{ r.fechaEmision | date:'short' }}</span>
            <span *ngIf="r.controlado" class="badge badge-red">Controlado</span>
            <span *ngIf="r.blockchainTx || r.blockchainId" class="badge badge-green">On-chain</span>
            <span *ngIf="r.controlado && !r.blockchainTx && !r.blockchainId" class="badge badge-amber">Pendiente blockchain</span>
          </div>
          <button (click)="verificar(r)" class="btn-link">Verificar integridad</button>
        </div>
        <p *ngIf="!esMedico && r.diagnostico" class="diagnostico">
          <strong>Diagnóstico:</strong> {{ r.diagnostico }}
        </p>
        <ul>
          <li *ngFor="let d of r.detalles">{{ d.medicamento.nombre }} × {{ d.cantidad }} <em *ngIf="d.posologia">— {{ d.posologia }}</em></li>
        </ul>
        <div *ngIf="r.blockchainTx" class="tx-info">
          <small>tx: <a [href]="'https://amoy.polygonscan.com/tx/' + r.blockchainTx" target="_blank">{{ r.blockchainTx.substring(0, 20) }}…</a></small>
        </div>
        <div *ngIf="verificaciones[r.id]" class="verify-result">
          <div *ngIf="verificaciones[r.id].verificando" class="meta">⏳ Verificando contra Polygon…</div>
          <div *ngIf="verificaciones[r.id].exists === true" class="verify-ok">
            ✓ Receta registrada en blockchain · Bloque {{ verificaciones[r.id].blockNumber }} · {{ verificaciones[r.id].timestamp ? (formatTs(verificaciones[r.id].timestamp)) : '' }}
          </div>
          <div *ngIf="verificaciones[r.id].exists === false" class="verify-warn">
            ⚠ {{ verificaciones[r.id].razon || 'No encontrada en blockchain' }}
          </div>
          <div *ngIf="verificaciones[r.id].error" class="verify-err">
            ✗ Error: {{ verificaciones[r.id].error }}
          </div>
        </div>
      </div>
      <p *ngIf="recetas.length === 0" style="color: #6b7280; text-align: center; padding: 20px;">
        {{ esMedico ? 'Aún no has emitido recetas.' : 'Aún no tienes recetas registradas.' }}
      </p>
    </div>
  `,
  styles: [`
    .form-block { padding: 16px; background: #f9fafb; border-radius: 6px; margin-top: 12px; }
    .form-block .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
    .form-block .field label { font-size: 12px; font-weight: 600; color: #374151; }
    .form-block .field .req { color: #dc2626; }
    .form-block input, .form-block select, .form-block textarea {
      width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; background: white;
    }
    .form-block input:focus, .form-block select:focus, .form-block textarea:focus {
      outline: none; border-color: #0f6e56; box-shadow: 0 0 0 2px rgba(15,110,86,0.15);
    }
    .form-block input.invalid, .form-block select.invalid { border-color: #dc2626; background: #fef2f2; }
    .error { color: #dc2626; font-size: 11px; }
    .error-banner {
      padding: 8px 12px; background: #fef2f2; color: #b91c1c;
      border: 1px solid #fecaca; border-radius: 4px; font-size: 13px; margin-bottom: 12px;
    }
    .items-header { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; }
    .items-header h4 { margin: 0; }
    .empty-items {
      padding: 12px; text-align: center; color: #6b7280; font-size: 13px;
      background: white; border: 1px dashed #d1d5db; border-radius: 4px;
    }
    .item-card { background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #e5e7eb; }
    .item-grid { display: grid; grid-template-columns: 2fr 110px 2fr 40px; gap: 10px; align-items: start; }
    @media (max-width: 700px) {
      .item-grid { grid-template-columns: 1fr; }
    }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .receta-card { padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 12px; }
    .meta { margin-left: 12px; font-size: 12px; color: #6b7280; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; margin-left: 6px; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .btn-primary { background: #0f6e56; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .btn-secondary { background: white; color: #0f6e56; border: 1px solid #0f6e56; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-link { background: none; border: none; color: #0f6e56; cursor: pointer; text-decoration: underline; }
    .btn-icon { background: none; border: none; color: #a32d2d; cursor: pointer; }
    .tx-info { margin-top: 8px; font-size: 11px; color: #6b7280; }
    .verify-result { margin-top: 8px; font-size: 12px; }
    .verify-ok { background: #d1fae5; color: #065f46; padding: 8px 12px; border-radius: 4px; }
    .verify-warn { background: #fef3c7; color: #92400e; padding: 8px 12px; border-radius: 4px; }
    .verify-err { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 4px; }
    .diagnostico { margin: 6px 0; font-size: 13px; color: #4b5563; }
  `]
})
export class MisRecetasComponent implements OnInit {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);

  esMedico = false;
  esPaciente = false;
  recetas: any[] = [];
  pacientes: any[] = [];
  medicamentos: any[] = [];
  showForm = false;
  emitiendo = false;
  emitError = '';
  verificaciones: Record<string, any> = {};
  form = { pacienteId: null as string | null, diagnostico: '', detalles: [] as any[] };

  ngOnInit() {
    this.supabase.role$.pipe(take(1)).subscribe(rol => {
      this.esMedico = rol === 'MEDICO';
      this.esPaciente = rol === 'PACIENTE';
      this.cargar();
      if (this.esMedico) {
        // Solo el medico necesita catalogos para el form de emitir
        this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
          .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
        this.apollo.query<any>({ query: LIST_MEDICAMENTOS, variables: { q: null, activo: true } })
          .subscribe(r => this.medicamentos = r.data?.medicamentos ?? []);
      }
    });
  }

  cargar() {
    if (this.esPaciente) {
      this.apollo.query<any>({ query: MIS_RECETAS_PACIENTE, fetchPolicy: 'network-only' })
        .subscribe({ next: r => this.recetas = r.data?.misRecetasPaciente ?? [], error: () => this.recetas = [] });
    } else {
      this.apollo.query<any>({ query: MIS_RECETAS, fetchPolicy: 'network-only' })
        .subscribe({ next: r => this.recetas = r.data?.misRecetas ?? [], error: () => this.recetas = [] });
    }
  }

  agregarItem() {
    this.form.detalles.push({ medicamentoId: null, cantidad: 1, posologia: '' });
  }

  emitir(form: import('@angular/forms').NgForm) {
    if (form.invalid || this.form.detalles.length === 0) { form.control.markAllAsTouched(); return; }
    this.emitiendo = true;
    this.emitError = '';
    const input = {
      pacienteId: this.form.pacienteId,
      medicoNombre: 'placeholder',  // el backend forzara al usuario autenticado
      medicoUid: 'placeholder',
      diagnostico: this.form.diagnostico,
      detalles: this.form.detalles
    };
    this.apollo.mutate<any>({ mutation: EMITIR_RECETA, variables: { input } }).subscribe({
      next: () => {
        this.emitiendo = false;
        this.showForm = false;
        this.form = { pacienteId: null, diagnostico: '', detalles: [] };
        this.cargar();
      },
      error: e => { this.emitiendo = false; this.emitError = e?.graphQLErrors?.[0]?.message || e.message; }
    });
  }

  verificar(r: any) {
    // Estado "verificando" mientras responde el gateway -> springboot -> ms-blockchain -> Polygon
    this.verificaciones[r.id] = { verificando: true };
    this.apollo.query<any>({
      query: VERIFICAR_RECETA,
      variables: { id: r.id },
      fetchPolicy: 'network-only',
    }).pipe(take(1)).subscribe({
      next: res => {
        this.verificaciones[r.id] = res.data?.verificarReceta
          ?? { error: 'Respuesta vacía del verificador' };
      },
      error: e => {
        this.verificaciones[r.id] = {
          error: e?.graphQLErrors?.[0]?.message || e.message || 'Servicio de blockchain no disponible',
        };
      },
    });
  }

  formatTs(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }
}
