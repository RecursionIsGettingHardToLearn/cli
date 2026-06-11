import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import {
  LIST_USUARIOS, LIST_PROVEEDORES, LIST_CATEGORIAS, ME,
  CAMBIAR_ROL_USUARIO, DESACTIVAR_USUARIO, ACTIVAR_USUARIO, ACTUALIZAR_USUARIO,
  CREAR_USUARIO
} from '../../core/graphql/queries';
import { PaginadorComponent, paginar } from '../../shared/paginador/paginador.component';

type Rol = 'ADMINISTRADOR' | 'MEDICO' | 'FARMACEUTICO' | 'PACIENTE';
interface UsuarioRow { id: string; nombre: string; email: string; rol: Rol; activo: boolean; }

@Component({
  selector: 'app-administracion',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginadorComponent],
  template: `
    <h1 class="page-title">Administración</h1>

    <div class="card">
      <div class="card-header">
        <h3>Usuarios</h3>
        <span class="hint">CRUD soft — los usuarios nacen al primer login (lazy provisioning) o se crean aquí.</span>
        <button class="btn-primary" type="button" style="margin-left:auto;" (click)="openCrear()">+ Nuevo usuario</button>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th class="acciones">Acciones</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let u of usuariosPagina; trackBy: trackId" [class.inactivo]="!u.activo">
            <td>{{ u.nombre }}<span *ngIf="u.id === miId" class="self-tag">tú</span></td>
            <td>{{ u.email }}</td>
            <td>
              <select [(ngModel)]="u.rol"
                      (change)="onRolChange(u)"
                      [disabled]="u.id === miId || saving[u.id]"
                      class="rol-select">
                <option *ngFor="let r of ROLES" [value]="r">{{ r }}</option>
              </select>
            </td>
            <td>
              <span class="badge" [class.badge-off]="!u.activo">
                {{ u.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td class="acciones">
              <button class="btn-icon"
                      [disabled]="saving[u.id]"
                      title="Editar nombre y email"
                      (click)="openEditar(u)">
                <i class="pi pi-pencil"></i>
              </button>
              <button *ngIf="u.activo" class="btn-icon danger"
                      [disabled]="u.id === miId || saving[u.id]"
                      [title]="u.id === miId ? 'No podés desactivarte a vos mismo' : 'Desactivar'"
                      (click)="toggleActivo(u)">
                <i class="pi pi-ban"></i>
              </button>
              <button *ngIf="!u.activo" class="btn-icon success"
                      [disabled]="saving[u.id]"
                      title="Reactivar"
                      (click)="toggleActivo(u)">
                <i class="pi pi-check"></i>
              </button>
            </td>
          </tr>
          <tr *ngIf="usuarios.length === 0 && !loading">
            <td colspan="5" style="text-align:center; padding: 20px; color:#6b7280;">
              Sin usuarios — se crearán al primer login (lazy provisioning).
            </td>
          </tr>
          <tr *ngIf="loading">
            <td colspan="5" style="text-align:center; padding: 20px; color:#6b7280;">Cargando…</td>
          </tr>
        </tbody>
      </table>

      <app-paginador [total]="usuarios.length" [pagina]="pagina" [porPagina]="porPagina"
                     (paginaChange)="pagina = $event"
                     (porPaginaChange)="porPagina = $event"></app-paginador>
      <div *ngIf="errorMsg" class="error-banner">{{ errorMsg }}</div>
    </div>

    <!-- Modal editar usuario -->
    <div class="modal-backdrop" *ngIf="editing" (click)="cancelEdit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Editar usuario</h3>
          <button class="btn-close" (click)="cancelEdit()" aria-label="Cerrar">
            <i class="pi pi-times"></i>
          </button>
        </div>
        <form class="form-grid" (ngSubmit)="saveEdit()">
          <label>
            <span>Nombre</span>
            <input type="text" [(ngModel)]="form.nombre" name="nombre"
                   required maxlength="150" autocomplete="off">
          </label>
          <label>
            <span>Email</span>
            <input type="email" [(ngModel)]="form.email" name="email"
                   required maxlength="150" autocomplete="off">
            <small class="hint-warn">
              ⚠ El email aquí se cambia solo en la BD de la clínica. Para que el usuario
              pueda volver a loguearse, también hay que actualizarlo en Supabase Auth.
            </small>
          </label>
          <div *ngIf="editErrorMsg" class="error-banner">{{ editErrorMsg }}</div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" (click)="cancelEdit()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="savingEdit">
              {{ savingEdit ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal crear usuario -->
    <div class="modal-backdrop" *ngIf="creating" (click)="cancelCrear()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Nuevo usuario</h3>
          <button class="btn-close" (click)="cancelCrear()" aria-label="Cerrar">
            <i class="pi pi-times"></i>
          </button>
        </div>
        <form class="form-grid" (ngSubmit)="saveCrear()">
          <label>
            <span>Nombre</span>
            <input type="text" [(ngModel)]="createForm.nombre" name="cNombre"
                   required maxlength="150" autocomplete="off">
          </label>
          <label>
            <span>Email</span>
            <input type="email" [(ngModel)]="createForm.email" name="cEmail"
                   required maxlength="150" autocomplete="off">
          </label>
          <label>
            <span>Contraseña temporal</span>
            <input type="password" [(ngModel)]="createForm.password" name="cPassword"
                   required minlength="6" autocomplete="new-password">
            <small class="hint-warn">Mínimo 6 caracteres. La cuenta de login se crea en Supabase con el rol elegido.</small>
          </label>
          <label>
            <span>Rol</span>
            <select [(ngModel)]="createForm.rol" name="cRol" class="rol-select">
              <option *ngFor="let r of ROLES" [value]="r">{{ r }}</option>
            </select>
          </label>

          <!-- Datos clinicos extra: solo cuando el rol es PACIENTE.
               El CI y el apellido son obligatorios; el CI es lo que buscan
               las automatizaciones (n8n) para contactar al paciente. -->
          <ng-container *ngIf="createForm.rol === 'PACIENTE'">
            <label>
              <span>CI (cédula de identidad)</span>
              <input type="text" [(ngModel)]="createForm.ci" name="cCi"
                     required maxlength="20" autocomplete="off">
            </label>
            <label>
              <span>Apellido</span>
              <input type="text" [(ngModel)]="createForm.apellido" name="cApellido"
                     required maxlength="150" autocomplete="off">
            </label>
            <label>
              <span>Teléfono <small class="hint-opt">(opcional)</small></span>
              <input type="text" [(ngModel)]="createForm.telefono" name="cTelefono"
                     maxlength="30" autocomplete="off">
            </label>
            <label>
              <span>Fecha de nacimiento <small class="hint-opt">(opcional)</small></span>
              <input type="date" [(ngModel)]="createForm.fechaNacimiento" name="cFechaNac">
            </label>
            <small class="hint-warn">Se crea la cuenta de login Y la ficha de paciente (con su CI y correo) en un solo paso.</small>
          </ng-container>

          <div *ngIf="createErrorMsg" class="error-banner">{{ createErrorMsg }}</div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" (click)="cancelCrear()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="savingCreate">
              {{ savingCreate ? 'Creando…' : 'Crear usuario' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <h3>Categorías</h3>
      <ul class="chip-list">
        <li *ngFor="let c of categorias">{{ c.nombre }}</li>
      </ul>
    </div>

    <div class="card">
      <h3>Proveedores</h3>
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>NIT</th><th>Teléfono</th><th>Email</th><th>Activo</th></tr></thead>
        <tbody>
          <tr *ngFor="let p of proveedores">
            <td>{{ p.nombre }}</td><td>{{ p.nit }}</td><td>{{ p.telefono }}</td>
            <td>{{ p.email }}</td><td>{{ p.activo ? '✓' : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .card-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    .card-header h3 { margin: 0; }
    .hint { font-size: 12px; color: #6b7280; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: middle; }
    .data-table th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    .data-table tr.inactivo { opacity: 0.55; }
    .badge { background: #5dcaa5; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }
    .badge-off { background: #9ca3af; }
    .chip-list { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .chip-list li { background: #f0fdf4; padding: 6px 12px; border-radius: 14px; font-size: 13px; }
    .rol-select {
      padding: 4px 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 13px;
      background: white;
      cursor: pointer;
    }
    .rol-select:disabled { background: #f3f4f6; cursor: not-allowed; }
    .acciones { width: 90px; text-align: center; }
    .btn-icon {
      background: transparent;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-icon:hover:not(:disabled) { background: #f3f4f6; }
    .btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-icon.danger { color: #b91c1c; border-color: #fecaca; }
    .btn-icon.success { color: #047857; border-color: #a7f3d0; }
    .self-tag {
      margin-left: 6px;
      background: #dbeafe;
      color: #1e40af;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .error-banner {
      margin-top: 12px;
      padding: 10px 14px;
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      border-radius: 4px;
      font-size: 13px;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }
    .modal {
      background: white;
      border-radius: 8px;
      width: 100%;
      max-width: 460px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.25);
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    .modal-header h3 { margin: 0; font-size: 16px; }
    .btn-close {
      background: transparent;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #6b7280;
      padding: 4px;
    }
    .btn-close:hover { color: #111827; }
    .form-grid {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .form-grid label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
    }
    .form-grid input {
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 14px;
    }
    .form-grid input:focus {
      outline: none;
      border-color: #0f6e56;
      box-shadow: 0 0 0 2px rgba(15,110,86,0.15);
    }
    .hint-warn { font-size: 11px; color: #92400e; font-weight: 400; }
    .hint-opt { font-size: 11px; color: #9ca3af; font-weight: 400; text-transform: none; }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
    .btn-primary, .btn-secondary {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary { background: #0f6e56; color: white; }
    .btn-primary:hover:not(:disabled) { background: #0c5a47; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary { background: white; color: #374151; border-color: #d1d5db; }
    .btn-secondary:hover { background: #f3f4f6; }
  `]
})
export class AdministracionComponent implements OnInit {
  private apollo = inject(Apollo);

  readonly ROLES: Rol[] = ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'];

  usuarios: UsuarioRow[] = [];
  pagina = 1;
  porPagina = 10;

  get usuariosPagina() { return paginar(this.usuarios, this.pagina, this.porPagina); }
  categorias: any[] = [];
  proveedores: any[] = [];

  miId: string | null = null;
  loading = true;
  saving: Record<string, boolean> = {};
  errorMsg = '';

  editing: UsuarioRow | null = null;
  form: { nombre: string; email: string } = { nombre: '', email: '' };
  savingEdit = false;
  editErrorMsg = '';

  creating = false;
  createForm: {
    nombre: string; email: string; password: string; rol: Rol;
    ci: string; apellido: string; telefono: string; fechaNacimiento: string;
  } = { nombre: '', email: '', password: '', rol: 'MEDICO', ci: '', apellido: '', telefono: '', fechaNacimiento: '' };
  savingCreate = false;
  createErrorMsg = '';

  ngOnInit() {
    this.apollo.query<any>({ query: ME, fetchPolicy: 'network-only' })
      .subscribe({ next: r => this.miId = r.data?.me?.id ?? null });

    this.fetchUsuarios();

    this.apollo.query<any>({ query: LIST_CATEGORIAS, fetchPolicy: 'network-only' })
      .subscribe(r => this.categorias = r.data?.categorias ?? []);
    this.apollo.query<any>({ query: LIST_PROVEEDORES, fetchPolicy: 'network-only' })
      .subscribe(r => this.proveedores = r.data?.proveedores ?? []);
  }

  private fetchUsuarios() {
    this.loading = true;
    this.apollo.query<any>({ query: LIST_USUARIOS, fetchPolicy: 'network-only' })
      .subscribe({
        next: r => { this.usuarios = r.data?.usuarios ?? []; this.pagina = 1; this.loading = false; },
        error: e => { this.errorMsg = this.parseError(e); this.loading = false; }
      });
  }

  onRolChange(u: UsuarioRow) {
    this.errorMsg = '';
    this.saving[u.id] = true;
    this.apollo.mutate({
      mutation: CAMBIAR_ROL_USUARIO,
      variables: { id: u.id, rol: u.rol }
    }).subscribe({
      next: () => { this.saving[u.id] = false; },
      error: e => {
        this.saving[u.id] = false;
        this.errorMsg = this.parseError(e);
        this.fetchUsuarios();
      }
    });
  }

  toggleActivo(u: UsuarioRow) {
    this.errorMsg = '';
    this.saving[u.id] = true;
    const mutation = u.activo ? DESACTIVAR_USUARIO : ACTIVAR_USUARIO;
    this.apollo.mutate({ mutation, variables: { id: u.id } }).subscribe({
      next: () => { u.activo = !u.activo; this.saving[u.id] = false; },
      error: e => { this.saving[u.id] = false; this.errorMsg = this.parseError(e); }
    });
  }

  trackId(_: number, u: UsuarioRow) { return u.id; }

  openCrear() {
    this.creating = true;
    this.createForm = { nombre: '', email: '', password: '', rol: 'MEDICO', ci: '', apellido: '', telefono: '', fechaNacimiento: '' };
    this.createErrorMsg = '';
  }

  cancelCrear() {
    this.creating = false;
    this.savingCreate = false;
    this.createErrorMsg = '';
  }

  saveCrear() {
    const nombre = this.createForm.nombre?.trim();
    const email = this.createForm.email?.trim().toLowerCase();
    const password = this.createForm.password ?? '';
    if (!nombre || !email || password.length < 6) {
      this.createErrorMsg = 'Nombre, email y contraseña (mínimo 6 caracteres) son obligatorios';
      return;
    }
    const esPaciente = this.createForm.rol === 'PACIENTE';
    const ci = this.createForm.ci?.trim();
    const apellido = this.createForm.apellido?.trim();
    const telefono = this.createForm.telefono?.trim();
    const fechaNacimiento = this.createForm.fechaNacimiento?.trim();
    if (esPaciente && (!ci || !apellido)) {
      this.createErrorMsg = 'Para un paciente, el CI y el apellido son obligatorios';
      return;
    }
    this.savingCreate = true;
    this.apollo.mutate<any>({
      mutation: CREAR_USUARIO,
      variables: {
        nombre, email, password, rol: this.createForm.rol,
        // Solo para pacientes; para otros roles el backend los ignora.
        ci: esPaciente ? ci : null,
        apellido: esPaciente ? apellido : null,
        telefono: esPaciente && telefono ? telefono : null,
        // <input type="date"> da 'YYYY-MM-DD'; lo mandamos como ISO para el scalar DateTime.
        fechaNacimiento: esPaciente && fechaNacimiento ? new Date(fechaNacimiento).toISOString() : null,
      }
    }).subscribe({
      next: () => { this.savingCreate = false; this.creating = false; this.fetchUsuarios(); },
      error: e => { this.savingCreate = false; this.createErrorMsg = this.parseError(e); }
    });
  }

  openEditar(u: UsuarioRow) {
    this.editing = u;
    this.form = { nombre: u.nombre, email: u.email };
    this.editErrorMsg = '';
  }

  cancelEdit() {
    this.editing = null;
    this.editErrorMsg = '';
    this.savingEdit = false;
  }

  saveEdit() {
    if (!this.editing) return;
    const target = this.editing;
    const nombre = this.form.nombre?.trim();
    const email = this.form.email?.trim().toLowerCase();
    if (!nombre || !email) {
      this.editErrorMsg = 'Nombre y email son obligatorios';
      return;
    }
    if (nombre === target.nombre && email === target.email) {
      this.cancelEdit();
      return;
    }
    this.savingEdit = true;
    this.editErrorMsg = '';
    this.apollo.mutate<any>({
      mutation: ACTUALIZAR_USUARIO,
      variables: { id: target.id, nombre, email }
    }).subscribe({
      next: r => {
        const updated = r.data?.actualizarUsuario;
        if (updated) {
          target.nombre = updated.nombre;
          target.email = updated.email;
        }
        this.savingEdit = false;
        this.editing = null;
      },
      error: e => {
        this.savingEdit = false;
        this.editErrorMsg = this.parseError(e);
      }
    });
  }

  private parseError(e: any): string {
    const gql = e?.graphQLErrors?.[0]?.message;
    return gql || e?.message || 'Error desconocido';
  }
}
