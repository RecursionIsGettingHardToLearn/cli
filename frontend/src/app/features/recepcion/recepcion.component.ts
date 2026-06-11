import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { LIST_PACIENTES, CREATE_PACIENTE } from '../../core/graphql/queries';
import { PaginadorComponent, paginar } from '../../shared/paginador/paginador.component';

// Reglas de validacion
const CI_REGEX = /^[0-9]{5,15}$/;
const NOMBRE_REGEX = /^(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ]).{2,100}$/;
const TEL_REGEX = /^[0-9+\-\s]{6,20}$/;
const EMAIL_REGEX = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

@Component({
  selector: 'app-recepcion',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginadorComponent],
  template: `
    <h1 class="page-title">Recepción — Pacientes</h1>

    <div class="card">
      <div class="top-bar">
        <input [(ngModel)]="q" (input)="buscar()" placeholder="Buscar por CI o nombre" class="search-input">
        <button (click)="toggleForm()" class="btn-primary">
          <i class="pi pi-plus"></i> Nuevo paciente
        </button>
      </div>

      <form *ngIf="showForm" #pacForm="ngForm" (ngSubmit)="crear(pacForm)" class="form-grid" novalidate>
        <div class="field">
          <label for="pac-ci">CI / Documento <span class="req">*</span></label>
          <input id="pac-ci" name="ci" type="text"
                 [(ngModel)]="form.ci" required
                 [pattern]="ciRegex"
                 #ciCtrl="ngModel"
                 [class.invalid]="ciCtrl.invalid && (ciCtrl.dirty || ciCtrl.touched)"
                 autocomplete="off">
          <small class="error" *ngIf="ciCtrl.invalid && (ciCtrl.dirty || ciCtrl.touched)">
            <ng-container *ngIf="ciCtrl.errors?.['required']">CI obligatorio.</ng-container>
            <ng-container *ngIf="ciCtrl.errors?.['pattern']">Solo dígitos (5 a 15).</ng-container>
          </small>
        </div>

        <div class="field">
          <label for="pac-fn">Fecha de nacimiento</label>
          <input id="pac-fn" name="fechaNacimiento" type="date"
                 [(ngModel)]="form.fechaNacimiento" [max]="todayISO"
                 #fnCtrl="ngModel"
                 [class.invalid]="fnCtrl.invalid && (fnCtrl.dirty || fnCtrl.touched)">
          <small class="error" *ngIf="fnCtrl.invalid && (fnCtrl.dirty || fnCtrl.touched)">
            No puede ser una fecha futura.
          </small>
        </div>

        <div class="field">
          <label for="pac-nombre">Nombre <span class="req">*</span></label>
          <input id="pac-nombre" name="nombre" type="text"
                 [(ngModel)]="form.nombre" required minlength="2" maxlength="100"
                 [pattern]="nombreRegex"
                 #nCtrl="ngModel"
                 [class.invalid]="nCtrl.invalid && (nCtrl.dirty || nCtrl.touched)"
                 autocomplete="off">
          <small class="error" *ngIf="nCtrl.invalid && (nCtrl.dirty || nCtrl.touched)">
            <ng-container *ngIf="nCtrl.errors?.['required']">Nombre obligatorio.</ng-container>
            <ng-container *ngIf="nCtrl.errors?.['pattern'] || nCtrl.errors?.['minlength']">
              Mínimo 2 caracteres, debe contener al menos una letra.
            </ng-container>
          </small>
        </div>

        <div class="field">
          <label for="pac-apellido">Apellido <span class="req">*</span></label>
          <input id="pac-apellido" name="apellido" type="text"
                 [(ngModel)]="form.apellido" required minlength="2" maxlength="100"
                 [pattern]="nombreRegex"
                 #aCtrl="ngModel"
                 [class.invalid]="aCtrl.invalid && (aCtrl.dirty || aCtrl.touched)"
                 autocomplete="off">
          <small class="error" *ngIf="aCtrl.invalid && (aCtrl.dirty || aCtrl.touched)">
            <ng-container *ngIf="aCtrl.errors?.['required']">Apellido obligatorio.</ng-container>
            <ng-container *ngIf="aCtrl.errors?.['pattern'] || aCtrl.errors?.['minlength']">
              Mínimo 2 caracteres, debe contener al menos una letra.
            </ng-container>
          </small>
        </div>

        <div class="field">
          <label for="pac-tel">Teléfono</label>
          <input id="pac-tel" name="telefono" type="tel"
                 [(ngModel)]="form.telefono"
                 [pattern]="telRegex"
                 #tCtrl="ngModel"
                 [class.invalid]="tCtrl.invalid && (tCtrl.dirty || tCtrl.touched)"
                 placeholder="Ej: 70044556"
                 autocomplete="off">
          <small class="error" *ngIf="tCtrl.invalid && (tCtrl.dirty || tCtrl.touched)">
            Solo números, espacios, + y - (6 a 20 caracteres).
          </small>
        </div>

        <div class="field">
          <label for="pac-email">Email</label>
          <input id="pac-email" name="email" type="email"
                 [(ngModel)]="form.email"
                 [pattern]="emailRegex"
                 #eCtrl="ngModel"
                 [class.invalid]="eCtrl.invalid && (eCtrl.dirty || eCtrl.touched)"
                 placeholder="ejemplo@correo.com"
                 autocomplete="off">
          <small class="error" *ngIf="eCtrl.invalid && (eCtrl.dirty || eCtrl.touched)">
            Email inválido.
          </small>
        </div>

        <div *ngIf="errorMsg" class="error-banner" style="grid-column: span 2;">{{ errorMsg }}</div>

        <div class="form-actions">
          <button type="button" class="btn-secondary" (click)="toggleForm()">Cancelar</button>
          <button type="submit" class="btn-primary" [disabled]="pacForm.invalid || saving">
            {{ saving ? 'Guardando…' : 'Guardar paciente' }}
          </button>
        </div>
      </form>

      <table class="data-table">
        <thead>
          <tr><th>CI</th><th>Nombre</th><th>Apellido</th><th>Teléfono</th><th>Email</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of pacientesPagina">
            <td>{{ p.ci }}</td><td>{{ p.nombre }}</td><td>{{ p.apellido }}</td>
            <td>{{ p.telefono }}</td><td>{{ p.email }}</td>
          </tr>
          <tr *ngIf="pacientes.length === 0">
            <td colspan="5" style="text-align:center; padding: 20px; color:#6b7280;">Sin resultados</td>
          </tr>
        </tbody>
      </table>

      <app-paginador [total]="pacientes.length" [pagina]="pagina" [porPagina]="porPagina"
                     (paginaChange)="pagina = $event"
                     (porPaginaChange)="porPagina = $event"></app-paginador>
    </div>
  `,
  styles: [`
    .top-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .search-input { flex: 1; min-width: 200px; padding: 8px 12px; border:1px solid #d1d5db; border-radius: 6px; }
    .form-grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 16px;
      padding: 16px; background: #f9fafb; border-radius: 6px; margin-bottom: 20px;
    }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 12px; font-weight: 600; color: #374151; }
    .field .req { color: #dc2626; }
    .form-grid input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; background: white; }
    .form-grid input:focus { outline: none; border-color: #0f6e56; box-shadow: 0 0 0 2px rgba(15,110,86,0.15); }
    .form-grid input.invalid { border-color: #dc2626; background: #fef2f2; }
    .error { color: #dc2626; font-size: 11px; }
    .error-banner {
      padding: 8px 12px; background: #fef2f2; color: #b91c1c;
      border: 1px solid #fecaca; border-radius: 4px; font-size: 13px;
    }
    .form-actions { grid-column: span 2; display: flex; justify-content: flex-end; gap: 8px; }
    .btn-primary { background: #0f6e56; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: white; color: #0f6e56; border: 1px solid #0f6e56; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
    .data-table th { background: #f3f4f6; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
      .form-actions { grid-column: span 1; }
    }
  `]
})
export class RecepcionComponent implements OnInit {
  private apollo = inject(Apollo);

  readonly ciRegex = CI_REGEX.source;
  readonly nombreRegex = NOMBRE_REGEX.source;
  readonly telRegex = TEL_REGEX.source;
  readonly emailRegex = EMAIL_REGEX.source;
  readonly todayISO = new Date().toISOString().slice(0, 10);

  pacientes: any[] = [];
  pagina = 1;
  porPagina = 10;

  get pacientesPagina() { return paginar(this.pacientes, this.pagina, this.porPagina); }
  q = '';
  showForm = false;
  saving = false;
  errorMsg = '';

  private readonly empty = { ci: '', nombre: '', apellido: '', telefono: '', email: '', fechaNacimiento: '' };
  form = { ...this.empty };

  ngOnInit() { this.buscar(); }

  buscar() {
    this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: this.q || null }, fetchPolicy: 'network-only' })
      .subscribe({ next: r => { this.pacientes = r.data?.pacientes ?? []; this.pagina = 1; }, error: e => console.error(e) });
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (this.showForm) { this.form = { ...this.empty }; this.errorMsg = ''; }
  }

  crear(form: NgForm) {
    if (form.invalid) { form.control.markAllAsTouched(); return; }
    this.saving = true;
    this.errorMsg = '';
    this.apollo.mutate<any>({ mutation: CREATE_PACIENTE, variables: { input: this.form } })
      .subscribe({
        next: () => {
          this.saving = false;
          this.showForm = false;
          this.form = { ...this.empty };
          this.buscar();
        },
        error: e => { this.saving = false; this.errorMsg = e?.graphQLErrors?.[0]?.message || e.message; }
      });
  }
}
