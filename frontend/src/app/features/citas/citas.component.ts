import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Apollo } from 'apollo-angular';
import { PaginadorComponent, paginar } from '../../shared/paginador/paginador.component';
import { take } from 'rxjs';
import { MIS_CITAS, CITAS, CREAR_CITA, CANCELAR_CITA, LIST_PACIENTES } from '../../core/graphql/queries';
import { SupabaseService } from '../../core/auth/supabase.service';

@Component({
  selector: 'app-citas',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginadorComponent],
  template: `
    <h1 class="page-title">Citas</h1>

    <div class="card" *ngIf="puedeCrear">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Agendar cita</h3>
        <button (click)="showForm = !showForm" class="btn-primary"><i class="pi pi-plus"></i> Nueva cita</button>
      </div>
      <form *ngIf="showForm" #f="ngForm" (ngSubmit)="crear(f)" class="form-block" novalidate>
        <div class="field">
          <label>Paciente <span class="req">*</span></label>
          <select name="pac" [(ngModel)]="form.pacienteId" required>
            <option [ngValue]="null">— Seleccionar —</option>
            <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
          </select>
        </div>
        <div class="grid2">
          <div class="field"><label>Especialidad</label>
            <input name="esp" [(ngModel)]="form.especialidad" placeholder="Ej: Cardiología"></div>
          <div class="field"><label>Urgencia</label>
            <select name="urg" [(ngModel)]="form.urgencia">
              <option value="">—</option><option value="BAJA">BAJA</option><option value="MEDIA">MEDIA</option><option value="ALTA">ALTA</option>
            </select></div>
        </div>
        <div class="field"><label>Fecha y hora <span class="req">*</span></label>
          <input type="datetime-local" name="fh" [(ngModel)]="form.fechaHora" required></div>
        <div class="field"><label>Motivo</label>
          <input name="mot" [(ngModel)]="form.motivo" maxlength="200" placeholder="Motivo de la consulta"></div>
        <div *ngIf="error" class="error-banner">{{ error }}</div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" (click)="showForm=false">Cancelar</button>
          <button type="submit" class="btn-primary" [disabled]="f.invalid || guardando">{{ guardando ? 'Guardando…' : 'Agendar' }}</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h3>{{ esPaciente ? 'Mis citas' : 'Citas agendadas' }}</h3>
      <div *ngFor="let c of citasPagina" class="cita-card">
        <div style="display:flex; justify-content:space-between;">
          <div>
            <strong *ngIf="!esPaciente && c.paciente">{{ c.paciente.nombre }} {{ c.paciente.apellido }}</strong>
            <strong>{{ c.especialidad || 'General' }}</strong>
            <span class="meta">{{ c.fechaHora | date:'short' }}</span>
            <span *ngIf="c.urgencia" class="badge" [class.badge-red]="c.urgencia==='ALTA'" [class.badge-amber]="c.urgencia==='MEDIA'">{{ c.urgencia }}</span>
            <span class="badge">{{ c.estado }}</span>
            <span class="meta">{{ c.medico?.nombre ? 'Dr(a). ' + c.medico.nombre : 'Sin médico asignado' }}</span>
          </div>
          <button *ngIf="c.estado === 'AGENDADA'" class="btn-secondary" (click)="cancelar(c)" [disabled]="cancelando === c.id">
            {{ cancelando === c.id ? 'Cancelando…' : 'Cancelar' }}
          </button>
        </div>
        <p *ngIf="c.motivo" class="meta">{{ c.motivo }}</p>
      </div>
      <p *ngIf="citas.length === 0" class="empty">No hay citas.</p>

      <app-paginador [total]="citas.length" [pagina]="pagina" [porPagina]="porPagina"
                     (paginaChange)="pagina = $event"
                     (porPaginaChange)="porPagina = $event"></app-paginador>
    </div>
  `,
  styles: [`
    .form-block { padding:16px; background:#f9fafb; border-radius:6px; margin-top:12px; }
    .field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
    .field label { font-size:12px; font-weight:600; color:#374151; } .req { color:#dc2626; }
    .field input, .field select { padding:8px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; background:#fff; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .form-actions { display:flex; justify-content:flex-end; gap:8px; }
    .error-banner { padding:8px 12px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; font-size:13px; margin-bottom:12px; }
    .cita-card { padding:12px 16px; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:10px; }
    .meta { margin-left:10px; font-size:12px; color:#6b7280; }
    .badge { font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; margin-left:6px; background:#e5e7eb; color:#374151; }
    .badge-red { background:#fee2e2; color:#991b1b; } .badge-amber { background:#fef3c7; color:#92400e; }
    .empty { color:#6b7280; text-align:center; padding:20px; }
  `]
})
export class CitasComponent implements OnInit {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);
  private route = inject(ActivatedRoute);

  esPaciente = false;
  puedeCrear = false;
  citas: any[] = [];
  pagina = 1;
  porPagina = 10;

  get citasPagina() { return paginar(this.citas, this.pagina, this.porPagina); }
  pacientes: any[] = [];
  showForm = false;
  guardando = false;
  error = '';
  cancelando: string | null = null;
  form = { pacienteId: null as string | null, especialidad: '', fechaHora: '', urgencia: '', motivo: '' };

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('especialidad')) { this.form.especialidad = qp.get('especialidad')!; this.showForm = true; }
    if (qp.get('urgencia')) this.form.urgencia = qp.get('urgencia')!;

    this.supabase.role$.pipe(take(1)).subscribe(rol => {
      this.esPaciente = rol === 'PACIENTE';
      this.puedeCrear = rol === 'ADMINISTRADOR' || rol === 'MEDICO';
      this.cargar();
      if (this.puedeCrear) {
        this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
          .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
      }
    });
  }

  cargar() {
    const q = this.esPaciente ? MIS_CITAS : CITAS;
    this.apollo.query<any>({ query: q, fetchPolicy: 'network-only' }).subscribe({
      next: r => { this.citas = r.data?.misCitas ?? r.data?.citas ?? []; this.pagina = 1; },
      error: () => this.citas = []
    });
  }

  crear(f: NgForm) {
    if (f.invalid) { f.control.markAllAsTouched(); return; }
    this.guardando = true; this.error = '';
    const input = {
      pacienteId: this.form.pacienteId,
      especialidad: this.form.especialidad || null,
      fechaHora: new Date(this.form.fechaHora).toISOString(),
      urgencia: this.form.urgencia || null,
      motivo: this.form.motivo || null
    };
    this.apollo.mutate<any>({ mutation: CREAR_CITA, variables: { input } }).subscribe({
      next: () => {
        this.guardando = false; this.showForm = false;
        this.form = { pacienteId: null, especialidad: '', fechaHora: '', urgencia: '', motivo: '' };
        this.cargar();
      },
      error: e => { this.guardando = false; this.error = e?.graphQLErrors?.[0]?.message || e.message; }
    });
  }

  cancelar(c: any) {
    if (!confirm('¿Cancelar esta cita?')) return;
    this.cancelando = c.id;
    this.apollo.mutate<any>({ mutation: CANCELAR_CITA, variables: { id: c.id } }).subscribe({
      next: () => { this.cancelando = null; this.cargar(); },
      error: e => { this.cancelando = null; alert(e?.graphQLErrors?.[0]?.message || e.message); }
    });
  }
}
