import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo, gql } from 'apollo-angular';
import { take } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SupabaseService, RolUsuario } from '../../core/auth/supabase.service';
import { Ms2Service } from '../../core/services/ms2.service';
import {
  CITAS, MIS_CITAS, LIST_PACIENTES, LIST_USUARIOS, LIST_MEDICAMENTOS,
  LIST_FACTURAS, MIS_RECETAS, MIS_RECETAS_PACIENTE,
  BI_VENTAS_DIARIAS, BI_TOP_MEDICAMENTOS, BI_INVENTARIO_CRITICO,
} from '../../core/graphql/queries';

const MIS_FACTURAS_R = gql`
  query MisFacturasReporte {
    misFacturas { id numero fecha total metodoPago estado }
  }
`;

// ---------------------------------------------------------------------------
// Catalogo de fuentes (tabla + columnas) con guardas por rol.
// La IA por voz recibe SOLO este catalogo (id + labels), nunca datos.
// ---------------------------------------------------------------------------
interface Campo { key: string; label: string; get: (r: any) => string; }
interface Fuente {
  id: string; label: string; roles: RolUsuario[];
  query: (rol: RolUsuario) => any;
  extract: (data: any) => any[];
  campos: Campo[];
}
interface ReporteEstatico {
  id: string; label: string; descripcion: string; roles: RolUsuario[];
  fuente: string; columnas: string[];
  resumen?: (rows: any[]) => { label: string; value: string }[];
}

const fmtFecha = (v: any) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');
const money = (v: any) => (v == null ? '' : 'Bs ' + Number(v).toFixed(2));

const FUENTES: Fuente[] = [
  {
    id: 'citas', label: 'Citas', roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'],
    query: rol => (rol === 'ADMINISTRADOR' ? CITAS : MIS_CITAS),
    extract: d => d?.citas ?? d?.misCitas ?? [],
    campos: [
      { key: 'fechaHora', label: 'Fecha y hora', get: r => fmtFecha(r.fechaHora) },
      { key: 'especialidad', label: 'Especialidad', get: r => r.especialidad ?? '' },
      { key: 'urgencia', label: 'Urgencia', get: r => r.urgencia ?? '' },
      { key: 'estado', label: 'Estado', get: r => r.estado ?? '' },
      { key: 'motivo', label: 'Motivo', get: r => r.motivo ?? '' },
      { key: 'medico', label: 'Médico', get: r => r.medico?.nombre ?? '' },
      { key: 'paciente', label: 'Paciente', get: r => r.paciente ? `${r.paciente.nombre} ${r.paciente.apellido ?? ''}`.trim() : '' },
    ],
  },
  {
    id: 'pacientes', label: 'Pacientes', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    query: () => LIST_PACIENTES, extract: d => d?.pacientes ?? [],
    campos: [
      { key: 'ci', label: 'CI', get: r => r.ci ?? '' },
      { key: 'nombre', label: 'Nombre', get: r => `${r.nombre ?? ''} ${r.apellido ?? ''}`.trim() },
      { key: 'telefono', label: 'Teléfono', get: r => r.telefono ?? '' },
      { key: 'email', label: 'Email', get: r => r.email ?? '' },
      { key: 'fechaNacimiento', label: 'F. nacimiento', get: r => (r.fechaNacimiento ?? '').slice(0, 10) },
    ],
  },
  {
    id: 'usuarios', label: 'Usuarios', roles: ['ADMINISTRADOR'],
    query: () => LIST_USUARIOS, extract: d => d?.usuarios ?? [],
    campos: [
      { key: 'nombre', label: 'Nombre', get: r => r.nombre ?? '' },
      { key: 'email', label: 'Email', get: r => r.email ?? '' },
      { key: 'rol', label: 'Rol', get: r => r.rol ?? '' },
      { key: 'activo', label: 'Activo', get: r => (r.activo ? 'Sí' : 'No') },
    ],
  },
  {
    id: 'medicamentos', label: 'Medicamentos', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    query: () => LIST_MEDICAMENTOS, extract: d => d?.medicamentos ?? [],
    campos: [
      { key: 'nombre', label: 'Nombre', get: r => r.nombre ?? '' },
      { key: 'categoria', label: 'Categoría', get: r => r.categoria?.nombre ?? '' },
      { key: 'precioVenta', label: 'Precio', get: r => money(r.precioVenta) },
      { key: 'stockMinimo', label: 'Stock mín.', get: r => String(r.stockMinimo ?? '') },
      { key: 'requiereReceta', label: 'Receta', get: r => (r.requiereReceta ? 'Sí' : 'No') },
      { key: 'controlado', label: 'Controlado', get: r => (r.controlado ? 'Sí' : 'No') },
      { key: 'activo', label: 'Activo', get: r => (r.activo ? 'Sí' : 'No') },
    ],
  },
  {
    id: 'facturas', label: 'Facturas', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    query: () => LIST_FACTURAS, extract: d => d?.facturas ?? [],
    campos: [
      { key: 'numero', label: 'Número', get: r => r.numero ?? '' },
      { key: 'fecha', label: 'Fecha', get: r => fmtFecha(r.fecha) },
      { key: 'paciente', label: 'Paciente', get: r => r.paciente ? `${r.paciente.nombre} ${r.paciente.apellido ?? ''}`.trim() : '' },
      { key: 'metodoPago', label: 'Método pago', get: r => r.metodoPago ?? '' },
      { key: 'total', label: 'Total', get: r => money(r.total) },
      { key: 'estado', label: 'Estado', get: r => r.estado ?? '' },
    ],
  },
  {
    id: 'mis_facturas', label: 'Mis facturas', roles: ['PACIENTE'],
    query: () => MIS_FACTURAS_R, extract: d => d?.misFacturas ?? [],
    campos: [
      { key: 'numero', label: 'Número', get: r => r.numero ?? '' },
      { key: 'fecha', label: 'Fecha', get: r => fmtFecha(r.fecha) },
      { key: 'metodoPago', label: 'Método pago', get: r => r.metodoPago ?? '' },
      { key: 'total', label: 'Total', get: r => money(r.total) },
      { key: 'estado', label: 'Estado', get: r => r.estado ?? '' },
    ],
  },
  {
    id: 'recetas', label: 'Recetas', roles: ['MEDICO', 'PACIENTE'],
    query: rol => (rol === 'PACIENTE' ? MIS_RECETAS_PACIENTE : MIS_RECETAS),
    extract: d => d?.misRecetas ?? d?.misRecetasPaciente ?? [],
    campos: [
      { key: 'fechaEmision', label: 'Emitida', get: r => fmtFecha(r.fechaEmision) },
      { key: 'estado', label: 'Estado', get: r => r.estado ?? '' },
      { key: 'controlado', label: 'Controlada', get: r => (r.controlado ? 'Sí' : 'No') },
      { key: 'paciente', label: 'Paciente', get: r => r.paciente ? `${r.paciente.nombre} ${r.paciente.apellido ?? ''}`.trim() : '' },
      { key: 'medicoNombre', label: 'Médico', get: r => r.medicoNombre ?? '' },
      { key: 'items', label: 'Medicamentos', get: r => (r.detalles ?? []).map((d: any) => `${d.medicamento?.nombre} x${d.cantidad}`).join(', ') },
      { key: 'blockchainTx', label: 'Blockchain TX', get: r => r.blockchainTx ?? '' },
    ],
  },
  {
    id: 'bi_ventas', label: 'BI · Ventas diarias', roles: ['ADMINISTRADOR'],
    query: () => BI_VENTAS_DIARIAS, extract: d => d?.biVentasDiarias ?? [],
    campos: [
      { key: 'dia', label: 'Día', get: r => r.dia ?? '' },
      { key: 'numFacturas', label: 'N° facturas', get: r => String(r.numFacturas ?? '') },
      { key: 'totalVendido', label: 'Total vendido', get: r => money(r.totalVendido) },
      { key: 'ticketPromedio', label: 'Ticket prom.', get: r => money(r.ticketPromedio) },
    ],
  },
  {
    id: 'bi_top', label: 'BI · Top medicamentos', roles: ['ADMINISTRADOR'],
    query: () => BI_TOP_MEDICAMENTOS, extract: d => d?.biTopMedicamentos ?? [],
    campos: [
      { key: 'medicamento', label: 'Medicamento', get: r => r.medicamento ?? '' },
      { key: 'unidadesVendidas', label: 'Unidades', get: r => String(r.unidadesVendidas ?? '') },
      { key: 'montoTotal', label: 'Monto', get: r => money(r.montoTotal) },
    ],
  },
  {
    id: 'bi_stock', label: 'BI · Inventario crítico', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    query: () => BI_INVENTARIO_CRITICO, extract: d => d?.biInventarioCritico ?? [],
    campos: [
      { key: 'medicamento', label: 'Medicamento', get: r => r.medicamento ?? '' },
      { key: 'stockActual', label: 'Stock actual', get: r => String(r.stockActual ?? '') },
      { key: 'stockMinimo', label: 'Stock mínimo', get: r => String(r.stockMinimo ?? '') },
      { key: 'nivel', label: 'Nivel', get: r => r.nivel ?? '' },
    ],
  },
];

function cuenta(rows: any[], get: (r: any) => string): { label: string; value: string }[] {
  const m = new Map<string, number>();
  rows.forEach(r => { const k = get(r) || '—'; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].map(([label, n]) => ({ label, value: String(n) }));
}
function suma(rows: any[], get: (r: any) => number): number {
  return rows.reduce((a, r) => a + (Number(get(r)) || 0), 0);
}

const ESTATICOS: ReporteEstatico[] = [
  {
    id: 'citas_estado', label: 'Citas por estado', roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'],
    descripcion: 'Todas las citas visibles para tu rol, con conteo por estado.',
    fuente: 'citas', columnas: ['fechaHora', 'especialidad', 'urgencia', 'estado', 'medico', 'paciente'],
    resumen: rows => [{ label: 'Total', value: String(rows.length) }, ...cuenta(rows, r => r.estado)],
  },
  {
    id: 'ventas_metodo', label: 'Ventas por método de pago', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    descripcion: 'Facturas emitidas con totales por método de pago.',
    fuente: 'facturas', columnas: ['numero', 'fecha', 'paciente', 'metodoPago', 'total', 'estado'],
    resumen: rows => [
      { label: 'Facturas', value: String(rows.length) },
      { label: 'Total', value: money(suma(rows, r => r.total)) },
      ...cuenta(rows, r => r.metodoPago),
    ],
  },
  {
    id: 'facturas_pend', label: 'Facturas pendientes', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    descripcion: 'Solo las facturas en estado PENDIENTE.',
    fuente: 'facturas', columnas: ['numero', 'fecha', 'paciente', 'total', 'estado'],
    resumen: rows => {
      const p = rows.filter(r => r.estado === 'PENDIENTE');
      return [{ label: 'Pendientes', value: String(p.length) }, { label: 'Monto pendiente', value: money(suma(p, r => r.total)) }];
    },
  },
  {
    id: 'stock_critico', label: 'Stock crítico', roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    descripcion: 'Medicamentos con stock por debajo del mínimo (BI).',
    fuente: 'bi_stock', columnas: ['medicamento', 'stockActual', 'stockMinimo', 'nivel'],
    resumen: rows => [{ label: 'Ítems críticos', value: String(rows.length) }],
  },
  {
    id: 'usuarios_rol', label: 'Usuarios por rol', roles: ['ADMINISTRADOR'],
    descripcion: 'Usuarios del sistema con conteo por rol y estado.',
    fuente: 'usuarios', columnas: ['nombre', 'email', 'rol', 'activo'],
    resumen: rows => [{ label: 'Total', value: String(rows.length) }, ...cuenta(rows, r => r.rol)],
  },
  {
    id: 'mis_recetas', label: 'Recetas emitidas / recibidas', roles: ['MEDICO', 'PACIENTE'],
    descripcion: 'Tus recetas, con su estado y registro en blockchain.',
    fuente: 'recetas', columnas: ['fechaEmision', 'estado', 'controlado', 'paciente', 'medicoNombre', 'items'],
    resumen: rows => [{ label: 'Total', value: String(rows.length) }, ...cuenta(rows, r => r.estado)],
  },
  {
    id: 'mis_gastos', label: 'Mis gastos', roles: ['PACIENTE'],
    descripcion: 'Tus facturas y el total gastado.',
    fuente: 'mis_facturas', columnas: ['numero', 'fecha', 'metodoPago', 'total', 'estado'],
    resumen: rows => [{ label: 'Facturas', value: String(rows.length) }, { label: 'Total', value: money(suma(rows, r => r.total)) }],
  },
  {
    id: 'ventas_30d', label: 'Ventas últimos días (BI)', roles: ['ADMINISTRADOR'],
    descripcion: 'Serie diaria de ventas con ticket promedio.',
    fuente: 'bi_ventas', columnas: ['dia', 'numFacturas', 'totalVendido', 'ticketPromedio'],
    resumen: rows => [{ label: 'Días', value: String(rows.length) }, { label: 'Vendido', value: money(suma(rows, r => r.totalVendido)) }],
  },
];

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h2>Reportes</h2>

      <div class="tabs">
        <button *ngFor="let t of tabs" class="tab" [class.activa]="tab === t.id" (click)="tab = t.id">{{ t.label }}</button>
      </div>

      <!-- ============ 1) ESTATICOS ============ -->
      <ng-container *ngIf="tab === 'estaticos'">
        <p class="ayuda">Reportes ya definidos para tu rol. Haz clic para generarlos y exportarlos.</p>
        <div class="cards">
          <div class="card sel" *ngFor="let r of estaticosRol" [class.activa]="estaticoSel?.id === r.id" (click)="abrirEstatico(r)">
            <div class="card-t">{{ r.label }}</div>
            <div class="card-d">{{ r.descripcion }}</div>
          </div>
        </div>

        <div class="panel" *ngIf="estaticoSel">
          <h3>{{ estaticoSel.label }}</h3>
          <div *ngIf="cargando" class="cargando">Generando…</div>
          <div *ngIf="error" class="error-banner">{{ error }}</div>
          <ng-container *ngIf="!cargando && !error">
            <div class="chips" *ngIf="resumen.length">
              <div class="chip" *ngFor="let c of resumen"><span>{{ c.label }}</span><strong>{{ c.value }}</strong></div>
            </div>
            <ng-container *ngTemplateOutlet="tabla"></ng-container>
            <ng-container *ngTemplateOutlet="exportar"></ng-container>
          </ng-container>
        </div>
      </ng-container>

      <!-- ============ 2) DINAMICOS ============ -->
      <ng-container *ngIf="tab === 'dinamicos'">
        <p class="ayuda">Arma tu propio reporte: elige una tabla y marca las columnas a incluir.</p>
        <div class="panel">
          <label class="lbl">Tabla / fuente de datos</label>
          <div class="chips">
            <button class="chip-btn" *ngFor="let f of fuentesRol" [class.activa]="fuenteSel?.id === f.id" (click)="elegirFuente(f)">{{ f.label }}</button>
          </div>

          <ng-container *ngIf="fuenteSel">
            <label class="lbl">Columnas ({{ colsSel.size }}/{{ fuenteSel.campos.length }})
              <a class="mini" (click)="todas()">todas</a> · <a class="mini" (click)="ninguna()">ninguna</a>
            </label>
            <div class="cols">
              <label class="col" *ngFor="let c of fuenteSel.campos">
                <input type="checkbox" [checked]="colsSel.has(c.key)" (change)="toggleCol(c.key)" /> {{ c.label }}
              </label>
            </div>
            <button class="btn" (click)="generarDinamico()" [disabled]="!colsSel.size || cargando">{{ cargando ? 'Generando…' : 'Generar reporte' }}</button>
          </ng-container>
        </div>

        <div class="panel" *ngIf="genero">
          <h3>{{ titulo }}</h3>
          <div *ngIf="error" class="error-banner">{{ error }}</div>
          <ng-container *ngIf="!cargando && !error">
            <ng-container *ngTemplateOutlet="tabla"></ng-container>
            <ng-container *ngTemplateOutlet="exportar"></ng-container>
          </ng-container>
        </div>
      </ng-container>

      <!-- ============ 3) IA POR VOZ ============ -->
      <ng-container *ngIf="tab === 'ia'">
        <p class="ayuda">Pide un reporte hablando (p. ej. “ventas de la última semana por método de pago”) o escríbelo. La IA elige los datos y redacta un análisis.</p>
        <div class="panel">
          <button class="btn mic" [class.rec]="grabando" (click)="toggleMic()" [disabled]="procesando">
            {{ procesando ? 'Procesando…' : grabando ? '⏹ Detener y generar' : '🎤 Grabar consulta' }}
          </button>
          <div class="rec-hint" *ngIf="grabando">Grabando… habla tu consulta y pulsa “Detener”.</div>

          <label class="lbl" style="margin-top:14px;">…o escríbela</label>
          <textarea [(ngModel)]="consultaTexto" rows="2" placeholder="Escribe tu consulta para el reporte" [disabled]="procesando"></textarea>
          <button class="btn" (click)="generarDesdeTexto()" [disabled]="!consultaTexto.trim() || procesando || grabando">Generar desde texto</button>

          <div *ngIf="error" class="error-banner" style="margin-top:10px;">{{ error }}</div>
        </div>

        <div class="panel" *ngIf="plan">
          <div class="ia-head">
            <h3>{{ plan.titulo }}</h3>
            <span class="prov" [class.ok]="plan.proveedor === 'openai'">{{ plan.proveedor === 'openai' ? 'OpenAI' : 'IA (fallback)' }}</span>
          </div>
          <p class="transcripcion" *ngIf="plan.transcripcion">“{{ plan.transcripcion }}”</p>
          <div class="narrativa" *ngIf="plan.narrativa">{{ plan.narrativa }}</div>
          <div *ngIf="cargando" class="cargando">Trayendo datos…</div>
          <ng-container *ngIf="!cargando">
            <ng-container *ngTemplateOutlet="tabla"></ng-container>
            <ng-container *ngTemplateOutlet="exportar"></ng-container>
          </ng-container>
        </div>
      </ng-container>

      <!-- ============ plantillas compartidas ============ -->
      <ng-template #tabla>
        <div class="twrap" *ngIf="columnas.length">
          <table>
            <thead><tr><th *ngFor="let c of columnas">{{ c.label }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of filasVisibles"><td *ngFor="let c of columnas">{{ c.get(r) }}</td></tr>
            </tbody>
          </table>
          <div class="count">
            {{ filas.length > MAX ? ('Mostrando ' + MAX + ' de ' + filas.length + ' (el archivo exportado incluye todos)') : filas.length + ' registro(s)' }}
          </div>
        </div>
        <p class="vacio" *ngIf="!columnas.length && plan">Este reporte es solo narrativo (sin tabla); puedes exportarlo a PDF.</p>
      </ng-template>

      <ng-template #exportar>
        <div class="export">
          <button class="btn out" (click)="exportarPDF()" [disabled]="!filas.length && !plan?.narrativa">Exportar PDF</button>
          <button class="btn out" (click)="exportarCSV()" [disabled]="!filas.length || !columnas.length">Exportar CSV</button>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .page { max-width: 1000px; }
    h2 { color: #0b5744; margin: 0 0 12px; }
    h3 { color: #0b5744; margin: 0 0 10px; font-size: 17px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .tab { padding: 8px 16px; border: 1px solid #d1d5db; background: #fff; border-radius: 20px; cursor: pointer; font-size: 14px; color: #374151; }
    .tab.activa { background: #0f6e56; border-color: #0f6e56; color: #fff; font-weight: 700; }
    .ayuda { color: #6b7280; font-size: 13.5px; margin: 0 0 12px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; background: #fff; }
    .card.sel { cursor: pointer; transition: border-color .12s, transform .12s; }
    .card.sel:hover { transform: translateY(-2px); border-color: #0f6e56; }
    .card.activa { border: 2px solid #0f6e56; }
    .card-t { font-weight: 700; color: #111827; font-size: 14.5px; }
    .card-d { color: #6b7280; font-size: 12.5px; margin-top: 3px; }
    .panel { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 14px 16px; margin-bottom: 14px; }
    .lbl { display: block; font-weight: 600; font-size: 13px; color: #374151; margin: 6px 0 8px; }
    .mini { color: #0f6e56; cursor: pointer; font-weight: 600; font-size: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .chip { border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 12px; background: #fbfdfc; font-size: 12px; color: #6b7280; }
    .chip strong { display: block; color: #0b5744; font-size: 15px; }
    .chip-btn { border: 1px solid #d1d5db; border-radius: 16px; background: #fff; padding: 6px 14px; cursor: pointer; font-size: 13px; }
    .chip-btn.activa { background: #0f6e56; border-color: #0f6e56; color: #fff; font-weight: 700; }
    .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; margin-bottom: 12px; }
    .col { display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 13.5px; cursor: pointer; }
    .btn { background: #0f6e56; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-weight: 700; cursor: pointer; font-size: 14px; }
    .btn:disabled { opacity: .55; cursor: default; }
    .btn.out { background: #fff; color: #0f6e56; border: 1px solid #0f6e56; }
    .btn.mic { width: 100%; padding: 14px; font-size: 15px; }
    .btn.mic.rec { background: #b91c1c; }
    .rec-hint { color: #b91c1c; font-size: 12.5px; text-align: center; margin-top: 8px; }
    textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font: inherit; margin-bottom: 10px; box-sizing: border-box; }
    .twrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0f6e56; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; white-space: nowrap; }
    td { padding: 7px 10px; border-bottom: 1px solid #eef2f1; }
    tr:nth-child(even) td { background: #f8fafc; }
    .count { color: #9ca3af; font-size: 11.5px; margin-top: 8px; text-align: right; }
    .export { display: flex; gap: 10px; margin-top: 14px; }
    .cargando { color: #6b7280; padding: 12px 0; }
    .vacio { color: #6b7280; font-size: 13px; }
    .error-banner { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 8px; padding: 10px 12px; font-size: 13px; }
    .ia-head { display: flex; align-items: center; justify-content: space-between; }
    .prov { font-size: 11px; border: 1px solid #f3b53f; color: #b45309; border-radius: 999px; padding: 3px 10px; }
    .prov.ok { border-color: #a7f3d0; color: #065f46; background: #ecfdf5; }
    .transcripcion { font-style: italic; color: #374151; }
    .narrativa { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; font-size: 14px; line-height: 1.5; }
  `],
})
export class ReportesComponent implements OnInit, OnDestroy {
  private apollo = inject(Apollo);
  private supabase = inject(SupabaseService);
  private ms2 = inject(Ms2Service);

  readonly MAX = 200;
  tabs: { id: 'estaticos' | 'dinamicos' | 'ia'; label: string }[] = [
    { id: 'estaticos', label: 'Estáticos' },
    { id: 'dinamicos', label: 'Dinámicos' },
    { id: 'ia', label: 'IA por voz' },
  ];
  tab: 'estaticos' | 'dinamicos' | 'ia' = 'estaticos';

  rol: RolUsuario = 'PACIENTE';
  fuentesRol: Fuente[] = [];
  estaticosRol: ReporteEstatico[] = [];

  // estado comun de resultados
  cargando = false;
  error = '';
  titulo = '';
  columnas: Campo[] = [];
  filas: any[] = [];
  resumen: { label: string; value: string }[] = [];
  get filasVisibles() { return this.filas.slice(0, this.MAX); }

  // estaticos
  estaticoSel: ReporteEstatico | null = null;

  // dinamicos
  fuenteSel: Fuente | null = null;
  colsSel = new Set<string>();
  genero = false;

  // ia por voz
  consultaTexto = '';
  grabando = false;
  procesando = false;
  plan: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  ngOnInit(): void {
    this.supabase.role$.pipe(take(1)).subscribe(rol => {
      this.rol = rol ?? 'PACIENTE';
      this.fuentesRol = FUENTES.filter(f => f.roles.includes(this.rol));
      this.estaticosRol = ESTATICOS.filter(r => r.roles.includes(this.rol));
    });
  }

  ngOnDestroy(): void {
    this.mediaRecorder?.stream.getTracks().forEach(t => t.stop());
  }

  private fuentePorId(id: string | null): Fuente | undefined {
    return id ? this.fuentesRol.find(f => f.id === id) : undefined;
  }

  private ejecutar(fuente: Fuente, fin: (rows: any[]) => void): void {
    this.cargando = true;
    this.error = '';
    this.filas = [];
    this.apollo.query({ query: fuente.query(this.rol), fetchPolicy: 'network-only' }).subscribe({
      next: r => { this.cargando = false; fin(fuente.extract(r.data) ?? []); },
      error: e => { this.cargando = false; this.error = 'No se pudieron cargar los datos: ' + (e?.message ?? e); },
    });
  }

  // ------------ estaticos ------------
  abrirEstatico(r: ReporteEstatico): void {
    const fuente = this.fuentePorId(r.fuente);
    if (!fuente) return;
    this.estaticoSel = r;
    this.titulo = r.label;
    this.columnas = fuente.campos.filter(c => r.columnas.includes(c.key));
    this.resumen = [];
    this.ejecutar(fuente, rows => {
      this.filas = rows;
      this.resumen = r.resumen ? r.resumen(rows) : [];
    });
  }

  // ------------ dinamicos ------------
  elegirFuente(f: Fuente): void {
    this.fuenteSel = f;
    this.colsSel = new Set(f.campos.map(c => c.key));
    this.genero = false;
    this.filas = [];
    this.error = '';
  }
  toggleCol(k: string): void { this.colsSel.has(k) ? this.colsSel.delete(k) : this.colsSel.add(k); }
  todas(): void { if (this.fuenteSel) this.colsSel = new Set(this.fuenteSel.campos.map(c => c.key)); }
  ninguna(): void { this.colsSel.clear(); }

  generarDinamico(): void {
    if (!this.fuenteSel) return;
    const f = this.fuenteSel;
    this.genero = true;
    this.titulo = 'Reporte dinámico — ' + f.label;
    this.columnas = f.campos.filter(c => this.colsSel.has(c.key));
    this.resumen = [];
    this.ejecutar(f, rows => (this.filas = rows));
  }

  // ------------ ia por voz ------------
  private get catalogo() {
    return this.fuentesRol.map(f => ({
      id: f.id, label: f.label,
      campos: f.campos.map(c => ({ key: c.key, label: c.label })),
    }));
  }

  async toggleMic(): Promise<void> {
    if (this.grabando) { this.mediaRecorder?.stop(); return; }
    this.error = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        this.grabando = false;
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        this.enviarIA(blob, undefined);
      };
      this.mediaRecorder.start();
      this.grabando = true;
    } catch {
      this.error = 'No pude acceder al micrófono. Revisa los permisos del navegador o escribe tu consulta.';
    }
  }

  generarDesdeTexto(): void {
    const c = this.consultaTexto.trim();
    if (c) this.enviarIA(undefined, c);
  }

  private enviarIA(audio?: Blob, consulta?: string): void {
    this.procesando = true;
    this.error = '';
    this.plan = null;
    this.columnas = [];
    this.filas = [];
    const fd = new FormData();
    if (audio) fd.append('audio', audio, 'consulta.webm');
    if (consulta) fd.append('consulta', consulta);
    fd.append('rol', this.rol);
    fd.append('catalogo', JSON.stringify(this.catalogo));
    this.ms2.reporteIa(fd).subscribe({
      next: plan => {
        this.procesando = false;
        this.plan = plan;
        this.titulo = plan?.titulo || 'Reporte con IA';
        const fuente = this.fuentePorId(plan?.fuente);
        if (!fuente) return; // narrativo puro
        const keys: string[] = plan?.columnas?.length ? plan.columnas : fuente.campos.map(c => c.key);
        this.columnas = fuente.campos.filter(c => keys.includes(c.key));
        if (!this.columnas.length) this.columnas = fuente.campos;
        this.ejecutar(fuente, rows => (this.filas = rows));
      },
      error: e => {
        this.procesando = false;
        this.error = 'El servicio de IA no respondió: ' + (e?.error?.detail || e?.message || 'verifica que ms-diagnostico-ia esté corriendo');
      },
    });
  }

  // ------------ exportar ------------
  private nombreArchivo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const slug = (this.titulo || 'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'reporte';
    return `${slug}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  exportarCSV(): void {
    const sep = ';';
    const esc = (v: string) => /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const head = this.columnas.map(c => esc(c.label)).join(sep);
    const body = this.filas.map(r => this.columnas.map(c => esc(c.get(r))).join(sep)).join('\n');
    const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.nombreArchivo() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  exportarPDF(): void {
    const doc = new jsPDF();
    const verde: [number, number, number] = [15, 110, 86];
    doc.setFontSize(16); doc.setTextColor(11, 87, 68);
    doc.text(this.titulo || 'Reporte', 14, 16);
    doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    doc.text(`Rol: ${this.rol}  ·  Generado: ${new Date().toLocaleString()}`, 14, 22);
    let y = 28;
    if (this.plan?.transcripcion) {
      doc.setFontSize(10); doc.setTextColor(55, 65, 81);
      const t = doc.splitTextToSize(`Consulta: "${this.plan.transcripcion}"`, 180);
      doc.text(t, 14, y); y += t.length * 4.6 + 2;
    }
    if (this.plan?.narrativa) {
      doc.setFontSize(10); doc.setTextColor(6, 95, 70);
      const t = doc.splitTextToSize(this.plan.narrativa, 180);
      doc.text(t, 14, y); y += t.length * 4.6 + 2;
    }
    if (this.resumen.length) {
      doc.setFontSize(9); doc.setTextColor(55, 65, 81);
      doc.text(this.resumen.map(c => `${c.label}: ${c.value}`).join('   ·   '), 14, y); y += 6;
    }
    if (this.columnas.length && this.filas.length) {
      autoTable(doc, {
        startY: y + 2,
        head: [this.columnas.map(c => c.label)],
        body: this.filas.map(r => this.columnas.map(c => c.get(r))),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: verde, fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }
    doc.save(this.nombreArchivo() + '.pdf');
  }
}
