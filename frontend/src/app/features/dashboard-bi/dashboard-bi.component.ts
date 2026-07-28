import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { Apollo } from 'apollo-angular';

// Chart.js 4 NO registra scales/elements por defecto. Sin esto: "category is not a registered scale".
Chart.register(...registerables);
import {
  BI_VENTAS_DIARIAS, BI_TOP_MEDICAMENTOS,
  BI_INVENTARIO_CRITICO, BI_RECETAS_BLOCKCHAIN,
  VERIFICAR_RECETA
} from '../../core/graphql/queries';

@Component({
  selector: 'app-dashboard-bi',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <h1 class="page-title">Dashboard BI</h1>

    <div class="filters">
      <label>Desde <input type="date" [(ngModel)]="desde" (change)="recargar()"></label>
      <label>Hasta <input type="date" [(ngModel)]="hasta" (change)="recargar()"></label>
      <button (click)="recargar()" class="btn-primary"><i class="pi pi-refresh"></i> Recargar</button>
    </div>

    <!-- Verificador puntual de receta en blockchain -->
    <div class="card verificador">
      <div class="verificador-header">
        <i class="pi pi-shield" style="color: #0f6e56;"></i>
        <h3>Verificar receta en blockchain</h3>
      </div>
      <div class="verificador-form">
        <input [(ngModel)]="verificadorId"
               placeholder="Pega el UUID de la receta a verificar on-chain"
               class="verificador-input">
        <button (click)="verificarRecetaPuntual()"
                [disabled]="!verificadorId || verificadorId.length < 36 || verificadorCargando"
                class="btn-primary">
          {{ verificadorCargando ? 'Verificando...' : 'Verificar' }}
        </button>
      </div>
      <div *ngIf="verificadorResultado" class="verificador-resultado">
        <div *ngIf="verificadorResultado.exists === true" class="vr-ok">
          ✓ Receta registrada en blockchain
          <div class="vr-detalles">
            <span><strong>Bloque:</strong> {{ verificadorResultado.blockNumber }}</span>
            <span><strong>Timestamp:</strong> {{ verificadorTimestampLegible() }}</span>
            <span><strong>ID on-chain:</strong> {{ verificadorResultado.id }}</span>
          </div>
        </div>
        <div *ngIf="verificadorResultado.exists === false && !verificadorResultado.error" class="vr-warn">
          ⚠ {{ verificadorResultado.razon || 'No registrada en blockchain' }}
        </div>
        <div *ngIf="verificadorResultado.error" class="vr-err">
          ✗ Error: {{ verificadorResultado.error }}
        </div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">Ventas hoy</div>
        <div class="kpi-value">Bs {{ totalHoy().toFixed(2) }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Facturas hoy</div>
        <div class="kpi-value">{{ facturasHoy() }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Items críticos</div>
        <div class="kpi-value" [style.color]="criticos() > 0 ? '#a32d2d' : '#0f6e56'">{{ criticos() }}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Recetas blockchain</div>
        <div class="kpi-value">{{ totalBlockchain() }}</div>
      </div>
    </div>

    <div class="grid-charts">
      <div class="card">
        <h3>Ventas por día</h3>
        <div class="chart-wrapper">
          <canvas baseChart [data]="ventasChart" [options]="lineOptions" type="line"></canvas>
        </div>
      </div>

      <div class="card">
        <h3>Top medicamentos</h3>
        <div class="chart-wrapper">
          <canvas baseChart [data]="topChart" [options]="barOptions" type="bar"></canvas>
        </div>
      </div>

      <div class="card">
        <h3>Inventario crítico</h3>
        <table class="data-table">
          <thead><tr><th>Medicamento</th><th>Stock</th><th>Mín</th><th>Nivel</th></tr></thead>
          <tbody>
            <tr *ngFor="let i of inventario.slice(0, 8)">
              <td>{{ i.medicamento }}</td>
              <td>{{ i.stockActual }}</td>
              <td>{{ i.stockMinimo }}</td>
              <td>
                <span class="badge" [class.badge-red]="i.nivel === 'SIN_STOCK' || i.nivel === 'CRITICO'"
                                    [class.badge-amber]="i.nivel === 'BAJO'"
                                    [class.badge-green]="i.nivel === 'OK'">{{ i.nivel }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Recetas y blockchain (por mes)</h3>
        <div class="chart-wrapper">
          <canvas baseChart [data]="bcChart" [options]="stackedBarOptions" type="bar"></canvas>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .filters { display: flex; gap: 12px; margin-bottom: 20px; align-items: end; }
    .filters label { display: flex; flex-direction: column; font-size: 12px; color: #6b7280; }
    .filters input { padding: 6px; border: 1px solid #d1d5db; border-radius: 4px; margin-top: 4px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .kpi-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 24px; font-weight: 700; color: #0f6e56; margin-top: 4px; }
    .grid-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .chart-wrapper { position: relative; height: 280px; width: 100%; }
    @media (max-width: 767px) {
      .grid-charts { grid-template-columns: 1fr; }
      .kpis { grid-template-columns: repeat(2, 1fr); }
      .chart-wrapper { height: 240px; }
    }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; }
    .data-table th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; color: #6b7280; }
    .badge { padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 700; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .verificador { margin-bottom: 20px; padding: 16px; border-left: 4px solid #0f6e56; }
    .verificador-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .verificador-header h3 { margin: 0; font-size: 16px; color: #0f6e56; }
    .verificador-form { display: flex; gap: 8px; }
    .verificador-input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-family: monospace; font-size: 13px; }
    .verificador-resultado { margin-top: 12px; font-size: 13px; }
    .vr-ok { background: #d1fae5; color: #065f46; padding: 12px; border-radius: 6px; font-weight: 600; }
    .vr-warn { background: #fef3c7; color: #92400e; padding: 12px; border-radius: 6px; font-weight: 600; }
    .vr-err { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 6px; font-weight: 600; }
    .vr-detalles { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 8px; font-weight: 400; font-size: 12px; }
  `]
})
export class DashboardBiComponent implements OnInit {
  private apollo = inject(Apollo);

  desde = '';
  hasta = '';
  ventas: any[] = [];
  top: any[] = [];
  inventario: any[] = [];
  bc: any[] = [];

  // Verificador puntual
  verificadorId = '';
  verificadorResultado: any = null;
  verificadorCargando = false;

  ventasChart: ChartData<'line'> = { labels: [], datasets: [] };
  topChart: ChartData<'bar'> = { labels: [], datasets: [] };
  bcChart: ChartData<'bar'> = { labels: [], datasets: [] };

  lineOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false };
  barOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, indexAxis: 'y' };
  stackedBarOptions: ChartConfiguration['options'] = {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { stacked: false }, y: { stacked: false } }
  };

  ngOnInit() { this.recargar(); }

  recargar() {
    const variables = { desde: this.desde || null, hasta: this.hasta || null };
    this.apollo.query<any>({ query: BI_VENTAS_DIARIAS, variables, fetchPolicy: 'network-only' })
      .subscribe({ next: r => { this.ventas = r.data?.biVentasDiarias ?? []; this.actualizarVentas(); }, error: () => {} });

    this.apollo.query<any>({ query: BI_TOP_MEDICAMENTOS, variables: { limit: 10 }, fetchPolicy: 'network-only' })
      .subscribe({ next: r => { this.top = r.data?.biTopMedicamentos ?? []; this.actualizarTop(); }, error: () => {} });

    this.apollo.query<any>({ query: BI_INVENTARIO_CRITICO, fetchPolicy: 'network-only' })
      .subscribe({ next: r => this.inventario = r.data?.biInventarioCritico ?? [], error: () => {} });

    this.apollo.query<any>({ query: BI_RECETAS_BLOCKCHAIN, variables, fetchPolicy: 'network-only' })
      .subscribe({ next: r => { this.bc = r.data?.biRecetasBlockchain ?? []; this.actualizarBc(); }, error: () => {} });
  }

  actualizarVentas() {
    const reversed = [...this.ventas].reverse();
    this.ventasChart = {
      labels: reversed.map(v => v.dia),
      datasets: [{
        label: 'Total vendido (Bs)',
        data: reversed.map(v => Number(v.totalVendido)),
        borderColor: '#0f6e56',
        backgroundColor: 'rgba(15,110,86,0.1)',
        tension: 0.3, fill: true
      }]
    };
  }

  actualizarTop() {
    this.topChart = {
      labels: this.top.map(t => t.medicamento),
      datasets: [{
        label: 'Unidades vendidas',
        data: this.top.map(t => Number(t.unidadesVendidas)),
        backgroundColor: '#5dcaa5'
      }]
    };
  }

  actualizarBc() {
    const reversed = [...this.bc].reverse();
    this.bcChart = {
      labels: reversed.map(b => b.mes),
      datasets: [
        { label: 'Total recetas', data: reversed.map(b => Number(b.totalRecetas)), backgroundColor: '#d6efe5' },
        { label: 'En blockchain', data: reversed.map(b => Number(b.registradasEnBlockchain)), backgroundColor: '#0f6e56' }
      ]
    };
  }

  totalHoy(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    return Number(this.ventas.find(v => v.dia === hoy)?.totalVendido || 0);
  }

  facturasHoy(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    return Number(this.ventas.find(v => v.dia === hoy)?.numFacturas || 0);
  }

  criticos(): number {
    return this.inventario.filter(i => i.nivel === 'SIN_STOCK' || i.nivel === 'CRITICO').length;
  }

  totalBlockchain(): number {
    return this.bc.reduce((s, b) => s + Number(b.registradasEnBlockchain), 0);
  }

  verificarRecetaPuntual() {
    if (!this.verificadorId) return;
    this.verificadorCargando = true;
    this.verificadorResultado = null;
    this.apollo.query<any>({
      query: VERIFICAR_RECETA,
      variables: { id: this.verificadorId.trim() },
      fetchPolicy: 'network-only'
    }).subscribe({
      next: res => {
        this.verificadorCargando = false;
        this.verificadorResultado = res.data?.verificarReceta || { exists: false, error: 'Sin respuesta' };
      },
      error: e => {
        this.verificadorCargando = false;
        this.verificadorResultado = { exists: false, error: e.message };
      }
    });
  }

  verificadorTimestampLegible(): string {
    const ts = this.verificadorResultado?.timestamp;
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
  }
}
