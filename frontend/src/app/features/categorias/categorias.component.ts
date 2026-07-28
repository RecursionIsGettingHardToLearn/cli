import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  LIST_CATEGORIAS, CREATE_CATEGORIA, UPDATE_CATEGORIA, DELETE_CATEGORIA,
} from '../../core/graphql/queries';

interface Categoria { id: number; nombre: string; descripcion?: string | null; }

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Categorías</h1>

    <div class="card">
      <div class="card-head">
        <h2>{{ editId ? 'Editar categoría' : 'Categorías de medicamentos' }}</h2>
        <button *ngIf="!mostrarForm" class="btn-primary" (click)="nuevo()">+ Nueva categoría</button>
      </div>

      <form *ngIf="mostrarForm" #f="ngForm" (ngSubmit)="guardar(f)" class="form-grid" novalidate>
        <div class="field">
          <label for="cat-nom">Nombre *</label>
          <input id="cat-nom" name="nombre" required maxlength="80"
                 [(ngModel)]="form.nombre" #nom="ngModel"
                 [class.invalid]="nom.invalid && nom.touched"
                 placeholder="Ej: Analgésicos">
        </div>
        <div class="field">
          <label for="cat-desc">Descripción</label>
          <input id="cat-desc" name="descripcion" maxlength="200"
                 [(ngModel)]="form.descripcion"
                 placeholder="Opcional (máx 200 caracteres)">
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
          <tr><th>Nombre</th><th>Descripción</th><th class="acciones">Acciones</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let c of categorias">
            <td>{{ c.nombre }}</td>
            <td class="muted">{{ c.descripcion || '—' }}</td>
            <td class="acciones">
              <button class="btn-link" (click)="editar(c)">Editar</button>
              <button *ngIf="esAdmin()" class="btn-link danger" (click)="eliminar(c)">Eliminar</button>
            </td>
          </tr>
          <tr *ngIf="categorias.length === 0">
            <td colspan="3" class="muted center">No hay categorías todavía.</td>
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
    .field label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .form-grid input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font: inherit; }
    .form-grid input:focus { outline: none; border-color: #0f6e56; }
    .form-grid input.invalid { border-color: #dc2626; }
    .form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eef0f2; }
    .data-table th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    .acciones { width: 160px; }
    .muted { color: #9ca3af; }
    .center { text-align: center; }
  `],
})
export class CategoriasComponent implements OnInit {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);
  private rol = toSignal(this.supabase.role$, { initialValue: null });

  categorias: Categoria[] = [];
  mostrarForm = false;
  guardando = false;
  editId: number | null = null;
  form: { nombre: string; descripcion: string } = { nombre: '', descripcion: '' };

  esAdmin() { return this.rol() === 'ADMINISTRADOR'; }

  ngOnInit() { this.cargar(); }

  cargar() {
    this.apollo.query<any>({ query: LIST_CATEGORIAS, fetchPolicy: 'network-only' })
      .subscribe({ next: r => this.categorias = r.data?.categorias ?? [], error: e => alert('Error: ' + e.message) });
  }

  nuevo() { this.editId = null; this.form = { nombre: '', descripcion: '' }; this.mostrarForm = true; }

  editar(c: Categoria) {
    this.editId = c.id;
    this.form = { nombre: c.nombre, descripcion: c.descripcion ?? '' };
    this.mostrarForm = true;
  }

  cancelar() { this.mostrarForm = false; this.editId = null; }

  guardar(f: NgForm) {
    if (f.invalid) { f.control.markAllAsTouched(); return; }
    this.guardando = true;
    const vars = this.editId
      ? { id: this.editId, nombre: this.form.nombre, descripcion: this.form.descripcion || null }
      : { nombre: this.form.nombre, descripcion: this.form.descripcion || null };
    this.apollo.mutate<any>({ mutation: this.editId ? UPDATE_CATEGORIA : CREATE_CATEGORIA, variables: vars })
      .subscribe({
        next: () => { this.guardando = false; this.mostrarForm = false; this.editId = null; this.cargar(); },
        error: e => { this.guardando = false; alert('Error: ' + e.message); },
      });
  }

  eliminar(c: Categoria) {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    this.apollo.mutate<any>({ mutation: DELETE_CATEGORIA, variables: { id: c.id } })
      .subscribe({
        next: () => this.cargar(),
        // El backend rechaza el borrado si la categoría está en uso; mostramos el motivo.
        error: e => alert(e.message),
      });
  }
}
