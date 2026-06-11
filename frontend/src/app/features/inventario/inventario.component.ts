import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { LIST_MEDICAMENTOS, CREATE_MEDICAMENTO, LIST_CATEGORIAS, LIST_LOTES, REGISTRAR_LOTE, LIST_PROVEEDORES } from '../../core/graphql/queries';
import { PaginadorComponent, paginar } from '../../shared/paginador/paginador.component';

// Nombre: no puede ser SOLO numeros (debe tener al menos una letra) y >= 2 chars.
const NOMBRE_REGEX = /^(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ]).{2,150}$/;
const CODIGO_LOTE_REGEX = /^[A-Za-z0-9\-]{2,50}$/;

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginadorComponent],
  template: `
    <h1 class="page-title">Inventario</h1>

    <div class="card">
      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <h3>Medicamentos</h3>
        <button (click)="toggleFormMed()" class="btn-primary">
          <i class="pi pi-plus"></i> Nuevo medicamento
        </button>
      </div>

      <form *ngIf="showFormMed" #medForm="ngForm" (ngSubmit)="crearMed(medForm)" class="form-grid" novalidate>
        <div class="field">
          <label for="med-nombre">Nombre <span class="req">*</span></label>
          <input id="med-nombre" name="nombre" type="text"
                 [(ngModel)]="formMed.nombre"
                 required minlength="2" maxlength="150"
                 [pattern]="nombreRegex"
                 #nombreCtrl="ngModel"
                 [class.invalid]="nombreCtrl.invalid && (nombreCtrl.dirty || nombreCtrl.touched)"
                 autocomplete="off">
          <small class="error" *ngIf="nombreCtrl.invalid && (nombreCtrl.dirty || nombreCtrl.touched)">
            <ng-container *ngIf="nombreCtrl.errors?.['required']">El nombre es obligatorio.</ng-container>
            <ng-container *ngIf="nombreCtrl.errors?.['minlength']">Mínimo 2 caracteres.</ng-container>
            <ng-container *ngIf="nombreCtrl.errors?.['pattern']">Debe contener al menos una letra (no solo números).</ng-container>
          </small>
        </div>

        <div class="field">
          <label for="med-cat">Categoría</label>
          <select id="med-cat" name="categoria" [(ngModel)]="formMed.categoriaId">
            <option [ngValue]="null">— Sin categoría —</option>
            <option *ngFor="let c of categorias" [ngValue]="c.id">{{ c.nombre }}</option>
          </select>
        </div>

        <div class="field">
          <label for="med-precio">Precio de venta (Bs) <span class="req">*</span></label>
          <input id="med-precio" name="precio" type="number" step="0.01" min="0.01"
                 [(ngModel)]="formMed.precioVenta"
                 required
                 #precioCtrl="ngModel"
                 [class.invalid]="precioCtrl.invalid && (precioCtrl.dirty || precioCtrl.touched)">
          <small class="error" *ngIf="precioCtrl.invalid && (precioCtrl.dirty || precioCtrl.touched)">
            <ng-container *ngIf="precioCtrl.errors?.['required']">Precio obligatorio.</ng-container>
            <ng-container *ngIf="precioCtrl.errors?.['min']">Debe ser mayor a 0.</ng-container>
          </small>
        </div>

        <div class="field">
          <label for="med-stock">Stock mínimo</label>
          <input id="med-stock" name="stockMin" type="number" min="0" step="1"
                 [(ngModel)]="formMed.stockMinimo"
                 #stockCtrl="ngModel"
                 [class.invalid]="stockCtrl.invalid && (stockCtrl.dirty || stockCtrl.touched)">
          <small class="error" *ngIf="stockCtrl.invalid && (stockCtrl.dirty || stockCtrl.touched)">
            No puede ser negativo.
          </small>
        </div>

        <label class="check" title="El medicamento solo puede dispensarse con receta médica firmada.">
          <input type="checkbox" [(ngModel)]="formMed.requiereReceta" name="rr">
          <span>
            <strong>Requiere receta médica</strong>
            <small>Solo se dispensa con receta firmada por un médico.</small>
          </span>
        </label>
        <label class="check" title="Psicotrópicos, estupefacientes u opioides. Toda receta queda registrada en blockchain para auditoría.">
          <input type="checkbox" [(ngModel)]="formMed.controlado" name="ctrl">
          <span>
            <strong>Sustancia controlada</strong>
            <small>Psicotrópico / estupefaciente. Cada receta se registra en blockchain.</small>
          </span>
        </label>

        <div class="field" style="grid-column: span 2;">
          <label for="med-desc">Descripción</label>
          <textarea id="med-desc" name="desc" [(ngModel)]="formMed.descripcion"
                    maxlength="500" rows="2"
                    placeholder="Información adicional opcional (máx 500 caracteres)"></textarea>
        </div>

        <div *ngIf="errorMed" class="error-banner" style="grid-column: span 2;">{{ errorMed }}</div>

        <div style="grid-column: span 2; display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" class="btn-secondary" (click)="toggleFormMed()">Cancelar</button>
          <button type="submit" class="btn-primary"
                  [disabled]="medForm.invalid || savingMed">
            {{ savingMed ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </form>

      <table class="data-table">
        <thead>
          <tr><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock mín</th><th>Flags</th><th></th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let m of medicamentosPagina">
            <td>{{ m.nombre }}</td>
            <td>{{ m.categoria?.nombre || '—' }}</td>
            <td>Bs {{ m.precioVenta }}</td>
            <td>{{ m.stockMinimo }}</td>
            <td>
              <span *ngIf="m.requiereReceta" class="badge badge-amber">Receta</span>
              <span *ngIf="m.controlado" class="badge badge-red">Controlado</span>
            </td>
            <td>
              <button (click)="toggleLotes(m)" class="btn-link">
                {{ medSeleccionado === m.id ? 'Ocultar lotes' : 'Ver lotes' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <app-paginador [total]="medicamentos.length" [pagina]="pagina" [porPagina]="porPagina"
                     (paginaChange)="pagina = $event"
                     (porPaginaChange)="porPagina = $event"></app-paginador>

      <div *ngIf="medSeleccionado" class="lotes-panel">
        <div style="display:flex; justify-content: space-between; align-items: center;">
          <h4>Lotes</h4>
          <button (click)="toggleFormLote()" class="btn-secondary">
            <i class="pi pi-plus"></i> Registrar entrada
          </button>
        </div>

        <form *ngIf="showFormLote" #loteForm="ngForm" (ngSubmit)="registrarLote(loteForm)" class="form-grid" novalidate>
          <div class="field">
            <label for="lote-codigo">Código de lote <span class="req">*</span></label>
            <input id="lote-codigo" name="codigo" type="text"
                   [(ngModel)]="formLote.codigoLote"
                   required maxlength="50"
                   [pattern]="codigoLoteRegex"
                   #codCtrl="ngModel"
                   [class.invalid]="codCtrl.invalid && (codCtrl.dirty || codCtrl.touched)"
                   autocomplete="off">
            <small class="error" *ngIf="codCtrl.invalid && (codCtrl.dirty || codCtrl.touched)">
              <ng-container *ngIf="codCtrl.errors?.['required']">Código obligatorio.</ng-container>
              <ng-container *ngIf="codCtrl.errors?.['pattern']">Solo letras, números y guiones (2-50 chars).</ng-container>
            </small>
          </div>

          <div class="field">
            <label for="lote-prov">Proveedor</label>
            <select id="lote-prov" name="prov" [(ngModel)]="formLote.proveedorId">
              <option [ngValue]="null">— Sin proveedor —</option>
              <option *ngFor="let p of proveedores" [ngValue]="p.id">{{ p.nombre }}</option>
            </select>
          </div>

          <div class="field">
            <label for="lote-venc">Fecha de vencimiento <span class="req">*</span></label>
            <input id="lote-venc" name="venc" type="date"
                   [(ngModel)]="formLote.fechaVencimiento"
                   required [min]="todayISO"
                   #vencCtrl="ngModel"
                   [class.invalid]="vencCtrl.invalid && (vencCtrl.dirty || vencCtrl.touched)">
            <small class="error" *ngIf="vencCtrl.invalid && (vencCtrl.dirty || vencCtrl.touched)">
              <ng-container *ngIf="vencCtrl.errors?.['required']">Fecha obligatoria.</ng-container>
              <ng-container *ngIf="vencCtrl.errors?.['min']">Debe ser hoy o futura.</ng-container>
            </small>
          </div>

          <div class="field">
            <label for="lote-cant">Cantidad <span class="req">*</span></label>
            <input id="lote-cant" name="cant" type="number" min="1" step="1"
                   [(ngModel)]="formLote.cantidad"
                   required
                   #cantCtrl="ngModel"
                   [class.invalid]="cantCtrl.invalid && (cantCtrl.dirty || cantCtrl.touched)">
            <small class="error" *ngIf="cantCtrl.invalid && (cantCtrl.dirty || cantCtrl.touched)">
              Debe ser al menos 1.
            </small>
          </div>

          <div class="field">
            <label for="lote-pc">Precio de compra (Bs) <span class="req">*</span></label>
            <input id="lote-pc" name="pc" type="number" step="0.01" min="0.01"
                   [(ngModel)]="formLote.precioCompra"
                   required
                   #pcCtrl="ngModel"
                   [class.invalid]="pcCtrl.invalid && (pcCtrl.dirty || pcCtrl.touched)">
            <small class="error" *ngIf="pcCtrl.invalid && (pcCtrl.dirty || pcCtrl.touched)">
              Debe ser mayor a 0.
            </small>
          </div>

          <div *ngIf="errorLote" class="error-banner" style="grid-column: span 2;">{{ errorLote }}</div>

          <div style="grid-column: span 2; display: flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn-secondary" (click)="toggleFormLote()">Cancelar</button>
            <button type="submit" class="btn-primary"
                    [disabled]="loteForm.invalid || savingLote">
              {{ savingLote ? 'Registrando…' : 'Registrar' }}
            </button>
          </div>
        </form>

        <table class="data-table">
          <thead><tr><th>Código</th><th>Vence</th><th>Stock</th><th>Precio compra</th><th>Proveedor</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of lotes">
              <td>{{ l.codigoLote }}</td>
              <td>{{ l.fechaVencimiento }}</td>
              <td>{{ l.cantidadActual }}</td>
              <td>Bs {{ l.precioCompra }}</td>
              <td>{{ l.proveedor?.nombre || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 16px; padding: 16px; background: #f9fafb; border-radius: 6px; margin-bottom: 16px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 12px; font-weight: 600; color: #374151; }
    .field .req { color: #dc2626; }
    .form-grid input, .form-grid select, .form-grid textarea {
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 14px;
      background: white;
    }
    .form-grid input:focus, .form-grid select:focus, .form-grid textarea:focus {
      outline: none;
      border-color: #0f6e56;
      box-shadow: 0 0 0 2px rgba(15,110,86,0.15);
    }
    .form-grid input.invalid, .form-grid select.invalid {
      border-color: #dc2626;
      background: #fef2f2;
    }
    .check {
      display: flex; align-items: flex-start; gap: 8px;
      font-size: 13px; padding: 10px 12px;
      background: white; border: 1px solid #e5e7eb; border-radius: 6px;
      cursor: pointer;
    }
    .check:hover { border-color: #0f6e56; background: #f9fefb; }
    .check input[type="checkbox"] { margin-top: 3px; flex-shrink: 0; }
    .check span { display: flex; flex-direction: column; gap: 2px; }
    .check strong { font-weight: 600; color: #111827; }
    .check small { font-size: 11px; color: #6b7280; font-weight: 400; }
    .error { color: #dc2626; font-size: 11px; }
    .error-banner {
      padding: 8px 12px;
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      border-radius: 4px;
      font-size: 13px;
    }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
    .data-table th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; margin-right: 4px; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .btn-primary { background: #0f6e56; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: white; color: #0f6e56; border: 1px solid #0f6e56; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .btn-link { background: none; border: none; color: #0f6e56; cursor: pointer; text-decoration: underline; }
    .lotes-panel { margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 6px; }
  `]
})
export class InventarioComponent implements OnInit {
  private apollo = inject(Apollo);

  readonly nombreRegex = NOMBRE_REGEX.source;
  readonly codigoLoteRegex = CODIGO_LOTE_REGEX.source;
  readonly todayISO = new Date().toISOString().slice(0, 10);

  medicamentos: any[] = [];
  pagina = 1;
  porPagina = 10;

  get medicamentosPagina() { return paginar(this.medicamentos, this.pagina, this.porPagina); }
  categorias: any[] = [];
  proveedores: any[] = [];
  lotes: any[] = [];
  medSeleccionado: string | null = null;
  showFormMed = false;
  showFormLote = false;
  savingMed = false;
  savingLote = false;
  errorMed = '';
  errorLote = '';

  private readonly emptyMed = { nombre: '', descripcion: '', categoriaId: null as number | null, precioVenta: null as number | null, requiereReceta: false, controlado: false, stockMinimo: 0 };
  private readonly emptyLote = { codigoLote: '', proveedorId: null as string | null, fechaVencimiento: '', cantidad: 1, precioCompra: null as number | null };
  formMed = { ...this.emptyMed };
  formLote = { ...this.emptyLote };

  ngOnInit() {
    this.cargar();
    this.apollo.query<any>({ query: LIST_CATEGORIAS }).subscribe(r => this.categorias = r.data?.categorias ?? []);
    this.apollo.query<any>({ query: LIST_PROVEEDORES }).subscribe(r => this.proveedores = r.data?.proveedores ?? []);
  }

  cargar() {
    this.apollo.query<any>({ query: LIST_MEDICAMENTOS, variables: { q: null, activo: null }, fetchPolicy: 'network-only' })
      .subscribe(r => { this.medicamentos = r.data?.medicamentos ?? []; this.pagina = 1; });
  }

  toggleFormMed() {
    this.showFormMed = !this.showFormMed;
    if (this.showFormMed) {
      this.formMed = { ...this.emptyMed };
      this.errorMed = '';
    }
  }

  toggleFormLote() {
    this.showFormLote = !this.showFormLote;
    if (this.showFormLote) {
      this.formLote = { ...this.emptyLote };
      this.errorLote = '';
    }
  }

  crearMed(form: NgForm) {
    if (form.invalid) { form.control.markAllAsTouched(); return; }
    this.savingMed = true;
    this.errorMed = '';
    this.apollo.mutate<any>({ mutation: CREATE_MEDICAMENTO, variables: { input: this.formMed } })
      .subscribe({
        next: () => { this.savingMed = false; this.showFormMed = false; this.cargar(); },
        error: e => { this.savingMed = false; this.errorMed = this.parseError(e); }
      });
  }

  toggleLotes(m: any) {
    if (this.medSeleccionado === m.id) { this.medSeleccionado = null; this.lotes = []; return; }
    this.medSeleccionado = m.id;
    this.apollo.query<any>({ query: LIST_LOTES, variables: { medicamentoId: m.id }, fetchPolicy: 'network-only' })
      .subscribe(r => this.lotes = r.data?.lotesByMedicamento ?? []);
  }

  registrarLote(form: NgForm) {
    if (!this.medSeleccionado) return;
    if (form.invalid) { form.control.markAllAsTouched(); return; }
    this.savingLote = true;
    this.errorLote = '';
    this.apollo.mutate<any>({
      mutation: REGISTRAR_LOTE,
      variables: { input: { medicamentoId: this.medSeleccionado, ...this.formLote } }
    }).subscribe({
      next: () => {
        this.savingLote = false;
        this.showFormLote = false;
        const id = this.medSeleccionado!;
        this.apollo.query<any>({ query: LIST_LOTES, variables: { medicamentoId: id }, fetchPolicy: 'network-only' })
          .subscribe(r => this.lotes = r.data?.lotesByMedicamento ?? []);
      },
      error: e => { this.savingLote = false; this.errorLote = this.parseError(e); }
    });
  }

  private parseError(e: any): string {
    return e?.graphQLErrors?.[0]?.message || e?.message || 'Error desconocido';
  }
}
