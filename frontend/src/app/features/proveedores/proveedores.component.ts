import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  LIST_PROVEEDORES, CREATE_PROVEEDOR, UPDATE_PROVEEDOR, DESACTIVAR_PROVEEDOR,
} from '../../core/graphql/queries';

interface Proveedor {
  id: string; nombre: string; nit?: string | null; telefono?: string | null;
  email?: string | null; direccion?: string | null; activo: boolean;
}

@Component({
  selector: 'app-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Proveedores</h1>

    <div class="card">
      <div class="card-head">
        <h2>{{ editId ? 'Editar proveedor' : 'Proveedores registrados' }}</h2>
        <button *ngIf="!mostrarForm" class="btn-primary" (click)="nuevo()">+ Nuevo proveedor</button>
      </div>

      <form *ngIf="mostrarForm" #f="ngForm" (ngSubmit)="guardar(f)" class="form-grid" novalidate>
        <div class="field">
          <label for="p-nom">Nombre *</label>
          <input id="p-nom" name="nombre" required maxlength="150"
                 [(ngModel)]="form.nombre" #nom="ngModel"
                 [class.invalid]="nom.invalid && nom.touched" placeholder="Razón social">
        </div>
        <div class="field">
          <label for="p-nit">NIT</label>
          <input id="p-nit" name="nit" maxlength="30" [(ngModel)]="form.nit" placeholder="Ej: 1023456789">
        </div>
        <div class="field">
          <label for="p-tel">Teléfono</label>
          <input id="p-tel" name="telefono" maxlength="30" [(ngModel)]="form.telefono" placeholder="Ej: 78900000">
        </div>
        <div class="field">
          <label for="p-mail">Email</label>
          <input id="p-mail" name="email" type="email" maxlength="150" [(ngModel)]="form.email"
                 placeholder="contacto@proveedor.com">
        </div>
        <div class="field wide">
          <label for="p-dir">Dirección</label>
          <input id="p-dir" name="direccion" maxlength="250" [(ngModel)]="form.direccion"
                 placeholder="Opcional">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-sec" (click)="cancelar()">Cancelar</button>
          <button type="submit" class="btn-primary" [disabled]="guardando">
            {{ guardando ? 'Guardando…' : (editId ? 'Guardar cambios' : 'Crear') }}
          </button>
        </div>
      </form>

      <table class="data-table">
        <thead>
          <tr><th>Nombre</th><th>NIT</th><th>Teléfono</th><th>Email</th><th>Estado</th><th class="acciones">Acciones</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of proveedores" [class.inactivo]="!p.activo">
            <td>{{ p.nombre }}</td>
            <td class="muted">{{ p.nit || '—' }}</td>
            <td class="muted">{{ p.telefono || '—' }}</td>
            <td class="muted">{{ p.email || '—' }}</td>
            <td>
              <span class="badge" [class.on]="p.activo" [class.off]="!p.activo">
                {{ p.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td class="acciones">
              <button class="btn-link" (click)="editar(p)">Editar</button>
              <button *ngIf="esAdmin() && p.activo" class="btn-link danger" (click)="desactivar(p)">Desactivar</button>
            </td>
          </tr>
          <tr *ngIf="proveedores.length === 0">
            <td colspan="6" class="muted center">No hay proveedores todavía.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-head h2 { margin: 0; font-size: 16px; color: #0f6e56; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 16px; padding: 16px; background: #f9fafb; border-radius: 6px; margin-bottom: 16px; }
    .field { display: flex; flex-direction: column; }
    .field.wide { grid-column: 1 / -1; }
    .field label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .form-grid input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font: inherit; }
    .form-grid input:focus { outline: none; border-color: #0f6e56; }
    .form-grid input.invalid { border-color: #dc2626; }
    .form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eef0f2; }
    .data-table th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    .data-table tr.inactivo td { opacity: .55; }
    .acciones { width: 170px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
    .badge.on { background: #e6f4ef; color: #0f6e56; }
    .badge.off { background: #fdecec; color: #dc2626; }
    .muted { color: #9ca3af; }
    .center { text-align: center; }
  `],
})
export class ProveedoresComponent implements OnInit {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);
  private rol = toSignal(this.supabase.role$, { initialValue: null });

  proveedores: Proveedor[] = [];
  mostrarForm = false;
  guardando = false;
  editId: string | null = null;
  private readonly vacio = { nombre: '', nit: '', telefono: '', email: '', direccion: '' };
  form = { ...this.vacio };

  esAdmin() { return this.rol() === 'ADMINISTRADOR'; }

  ngOnInit() { this.cargar(); }

  cargar() {
    this.apollo.query<any>({ query: LIST_PROVEEDORES, fetchPolicy: 'network-only' })
      .subscribe({ next: r => this.proveedores = r.data?.proveedores ?? [], error: e => alert('Error: ' + e.message) });
  }

  nuevo() { this.editId = null; this.form = { ...this.vacio }; this.mostrarForm = true; }

  editar(p: Proveedor) {
    this.editId = p.id;
    this.form = {
      nombre: p.nombre, nit: p.nit ?? '', telefono: p.telefono ?? '',
      email: p.email ?? '', direccion: p.direccion ?? '',
    };
    this.mostrarForm = true;
  }

  cancelar() { this.mostrarForm = false; this.editId = null; }

  guardar(f: NgForm) {
    if (f.invalid) { f.control.markAllAsTouched(); return; }
    this.guardando = true;
    // null en los vacíos: el backend hace update parcial (solo pisa lo que llega no-null).
    const limpio = (v: string) => (v && v.trim() ? v.trim() : null);
    const base = {
      nombre: this.form.nombre.trim(), nit: limpio(this.form.nit),
      telefono: limpio(this.form.telefono), email: limpio(this.form.email),
      direccion: limpio(this.form.direccion),
    };
    const vars = this.editId ? { id: this.editId, ...base } : base;
    this.apollo.mutate<any>({ mutation: this.editId ? UPDATE_PROVEEDOR : CREATE_PROVEEDOR, variables: vars })
      .subscribe({
        next: () => { this.guardando = false; this.mostrarForm = false; this.editId = null; this.cargar(); },
        error: e => { this.guardando = false; alert('Error: ' + e.message); },
      });
  }

  desactivar(p: Proveedor) {
    if (!confirm(`¿Desactivar al proveedor "${p.nombre}"? Podrás reactivarlo editándolo luego.`)) return;
    this.apollo.mutate<any>({ mutation: DESACTIVAR_PROVEEDOR, variables: { id: p.id } })
      .subscribe({ next: () => this.cargar(), error: e => alert('Error: ' + e.message) });
  }
}
