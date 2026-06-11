import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Apollo } from 'apollo-angular';
import { LIST_FACTURAS, ANULAR_FACTURA } from '../../core/graphql/queries';
import { PaginadorComponent, paginar } from '../../shared/paginador/paginador.component';

@Component({
  selector: 'app-facturas',
  standalone: true,
  imports: [CommonModule, PaginadorComponent],
  template: `
    <h1 class="page-title">Facturas emitidas</h1>

    <div class="card">
      <p *ngIf="errorMsg" class="error-msg">{{ errorMsg }}</p>
      <p *ngIf="loading" class="empty">Cargando…</p>
      <p *ngIf="!loading && !errorMsg && facturas.length === 0" class="empty">
        Aún no hay facturas emitidas. Las ventas hechas en Caja aparecerán aquí.
      </p>

      <table *ngIf="facturas.length > 0" class="tabla">
        <thead>
          <tr>
            <th>Número</th><th>Fecha</th><th>Paciente</th><th>Pago</th>
            <th class="num">Total</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngFor="let f of facturasPagina">
            <tr class="fila" (click)="toggle(f.id)" title="Click para ver el detalle">
              <td class="mono">{{ f.numero }}</td>
              <td>{{ f.fecha | date:'short' }}</td>
              <td>
                <span *ngIf="f.paciente">{{ f.paciente.nombre }} {{ f.paciente.apellido }} <small class="meta">({{ f.paciente.ci }})</small></span>
                <span *ngIf="!f.paciente" class="meta">— Sin registro —</span>
              </td>
              <td>{{ f.metodoPago }}</td>
              <td class="num">Bs {{ f.total }}</td>
              <td>
                <span class="badge"
                      [class.badge-green]="f.estado === 'PAGADA'"
                      [class.badge-red]="f.estado === 'ANULADA'">{{ f.estado }}</span>
              </td>
              <td>
                <button *ngIf="f.estado === 'PAGADA'" class="btn-anular"
                        (click)="anular(f); $event.stopPropagation()"
                        [disabled]="anulando[f.id]">
                  {{ anulando[f.id] ? '...' : 'Anular' }}
                </button>
              </td>
            </tr>
            <tr *ngIf="expandedId === f.id">
              <td colspan="7" class="detalle">
                <div *ngFor="let d of f.detalles" class="det-row">
                  <span>{{ d.medicamento.nombre }}</span>
                  <span class="meta">x{{ d.cantidad }} · Bs {{ d.precioUnitario }} c/u</span>
                  <span class="num">Bs {{ d.subtotal }}</span>
                </div>
                <div class="det-row tot">
                  <span class="meta">Subtotal Bs {{ f.subtotal }} · Descuento Bs {{ f.descuento }}</span>
                  <span class="num"><strong>Total Bs {{ f.total }}</strong></span>
                </div>
              </td>
            </tr>
          </ng-container>
        </tbody>
      </table>

      <app-paginador [total]="facturas.length" [pagina]="pagina" [porPagina]="porPagina"
                     (paginaChange)="pagina = $event"
                     (porPaginaChange)="porPagina = $event"></app-paginador>
    </div>
  `,
  styles: [`
    .tabla { width: 100%; border-collapse: collapse; font-size: 14px; }
    .tabla th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; padding: 8px; border-bottom: 2px solid #e5e7eb; }
    .tabla td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
    .fila { cursor: pointer; }
    .fila:hover { background: #f0fdf4; }
    .num { text-align: right; font-weight: 600; }
    .mono { font-family: monospace; }
    .meta { color: #6b7280; font-size: 12px; }
    .badge { font-size: 10px; padding: 2px 8px; border-radius: 3px; font-weight: 600; background: #f3f4f6; color: #374151; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .btn-anular { background: white; color: #a32d2d; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }
    .btn-anular:hover { background: #fee2e2; }
    .btn-anular:disabled { opacity: 0.5; cursor: not-allowed; }
    .detalle { background: #f9fafb; padding: 12px 16px; }
    .det-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; }
    .det-row.tot { border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 8px; }
    .error-msg { padding: 10px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 13px; }
    .empty { padding: 16px; text-align: center; color: #6b7280; font-size: 13px; }
  `]
})
export class FacturasComponent implements OnInit {
  private apollo = inject(Apollo);
  facturas: any[] = [];
  pagina = 1;
  porPagina = 10;

  get facturasPagina() { return paginar(this.facturas, this.pagina, this.porPagina); }
  loading = false;
  errorMsg = '';
  expandedId: string | null = null;
  anulando: Record<string, boolean> = {};

  ngOnInit() { this.cargar(); }

  cargar() {
    this.loading = true; this.errorMsg = '';
    this.apollo.query<any>({ query: LIST_FACTURAS, fetchPolicy: 'network-only' }).subscribe({
      next: r => {
        const lista = r.data?.facturas ?? [];
        this.pagina = 1;
        this.facturas = [...lista].sort(
          (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );
        this.loading = false;
      },
      error: e => { this.errorMsg = e?.graphQLErrors?.[0]?.message || e.message; this.loading = false; }
    });
  }

  toggle(id: string) { this.expandedId = this.expandedId === id ? null : id; }

  anular(f: any) {
    const motivo = prompt('Motivo de anulación (opcional):');
    if (motivo === null) return;
    this.anulando[f.id] = true;
    this.apollo.mutate<any>({ mutation: ANULAR_FACTURA, variables: { id: f.id, motivo: motivo || null } }).subscribe({
      next: () => { this.anulando[f.id] = false; this.cargar(); },
      error: e => { this.anulando[f.id] = false; alert(e?.graphQLErrors?.[0]?.message || e.message); }
    });
  }
}
