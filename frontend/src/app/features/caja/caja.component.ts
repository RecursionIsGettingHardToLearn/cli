import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { LIST_MEDICAMENTOS, LIST_PACIENTES, CREATE_FACTURA, VERIFICAR_RECETA } from '../../core/graphql/queries';

interface VerificacionResultado {
  exists: boolean;
  blockNumber?: number;
  timestamp?: number;
  error?: string;
  loading?: boolean;
}

interface CartItem {
  medicamentoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  controlado: boolean;
  requiereReceta: boolean;
  recetaId?: string;
  verificacion?: VerificacionResultado;
}

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="page-title">Caja — Punto de venta</h1>

    <div class="grid">
      <div class="card products">
        <h3>Medicamentos disponibles</h3>
        <div class="field">
          <label for="caja-search">Buscar medicamento por nombre</label>
          <input id="caja-search" [(ngModel)]="q" name="qsearch" (input)="buscarMed()"
                 placeholder="Escribe para filtrar (ej: ibuprofeno)"
                 class="search">
        </div>
        <small class="hint-text">Click en un medicamento para agregarlo al carrito</small>
        <div class="med-list">
          <div *ngFor="let m of medicamentos" class="med-card" (click)="agregar(m)">
            <div>
              <div class="med-name">{{ m.nombre }}</div>
              <div class="med-meta">
                <span *ngIf="m.requiereReceta" class="badge badge-amber">Receta</span>
                <span *ngIf="m.controlado" class="badge badge-red">Controlado</span>
              </div>
            </div>
            <div class="med-price">Bs {{ m.precioVenta }}</div>
          </div>
        </div>
      </div>

      <div class="card cart">
        <h3>Carrito</h3>
        <p *ngIf="carrito.length === 0" class="empty-cart">
          Carrito vacío. Selecciona medicamentos de la lista de la izquierda.
        </p>

        <div *ngFor="let it of carrito; let i = index" class="cart-item">
          <div style="flex:1;">
            <div class="cart-item-name">{{ it.nombre }}</div>
            <div *ngIf="it.requiereReceta" class="receta-block">
              <label [attr.for]="'rec-' + i" class="receta-label">
                ID de receta médica <span class="req">*</span>
              </label>
              <div class="receta-input-row">
                <input [id]="'rec-' + i" [(ngModel)]="it.recetaId" [name]="'r' + i"
                       placeholder="Pega aquí el UUID de la receta"
                       class="receta-input">
                <button type="button"
                        (click)="verificarRecetaItem(i)"
                        [disabled]="!it.recetaId || it.recetaId.length < 36 || it.verificacion?.loading"
                        class="btn-verify">
                  {{ it.verificacion?.loading ? '...' : 'Verificar' }}
                </button>
              </div>
              <span *ngIf="it.verificacion?.exists === true" class="badge badge-green">✓ On-chain · Bloque {{ it.verificacion?.blockNumber }}</span>
              <span *ngIf="it.verificacion && it.verificacion.exists === false && !it.verificacion.error" class="badge badge-amber">⚠ No registrada</span>
              <span *ngIf="it.verificacion?.error" class="badge badge-red">✗ {{ it.verificacion?.error }}</span>
            </div>
          </div>
          <div class="cant-wrap">
            <label [attr.for]="'qty-' + i" class="qty-label">Cant.</label>
            <input [id]="'qty-' + i" type="number" [(ngModel)]="it.cantidad" [name]="'c' + i" min="1" step="1" class="qty-input">
          </div>
          <span class="subtotal">Bs {{ (it.precio * it.cantidad).toFixed(2) }}</span>
          <button (click)="quitar(i)" class="btn-icon" title="Quitar del carrito">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <div class="total-row">
          <strong>Total: Bs {{ total().toFixed(2) }}</strong>
        </div>

        <div class="field">
          <label for="caja-paciente">Paciente (opcional)</label>
          <select id="caja-paciente" [(ngModel)]="pacienteId" name="paciente">
            <option [ngValue]="null">— Cliente sin registro —</option>
            <option *ngFor="let p of pacientes" [ngValue]="p.id">{{ p.ci }} · {{ p.nombre }} {{ p.apellido }}</option>
          </select>
          <small class="hint-text">Si el cliente está registrado, la factura quedará vinculada a su historial.</small>
        </div>

        <div class="field">
          <label for="caja-metodo">Método de pago <span class="req">*</span></label>
          <select id="caja-metodo" [(ngModel)]="metodoPago" name="metodo" required>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia bancaria</option>
            <option value="QR">Pago por QR</option>
          </select>
        </div>

        <div class="field" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="caja-pendiente" [(ngModel)]="dejarPendiente" name="pendiente" />
          <label for="caja-pendiente" style="margin:0; font-weight:400;">
            Dejar PENDIENTE — el paciente la paga en línea con tarjeta (Stripe)
          </label>
        </div>

        <button (click)="facturar()" [disabled]="carrito.length === 0 || facturando" class="btn-primary">
          {{ facturando ? 'Facturando...' : 'Facturar' }}
        </button>

        <div *ngIf="ultimaFactura" class="success-msg">
          Factura {{ ultimaFactura.numero }} — Bs {{ ultimaFactura.total }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .field > label { font-size: 12px; font-weight: 600; color: #374151; }
    .field .req { color: #dc2626; }
    .hint-text { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .products .search { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; }
    .products .search:focus { outline: none; border-color: #0f6e56; box-shadow: 0 0 0 2px rgba(15,110,86,0.15); }
    .med-list { max-height: 600px; overflow-y: auto; margin-top: 10px; }
    .empty-cart { padding: 16px; text-align: center; color: #6b7280; font-size: 13px; background: #f9fafb; border-radius: 4px; border: 1px dashed #d1d5db; }
    .cart-item-name { font-weight: 500; }
    .cant-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .qty-label { font-size: 10px; color: #6b7280; }
    .qty-input { width: 60px; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; text-align: center; }
    .subtotal { min-width: 70px; text-align: right; font-weight: 600; color: #111827; }
    .receta-label { font-size: 11px; font-weight: 600; color: #92400e; display: block; margin-top: 6px; }
    .receta-input-row { display: flex; gap: 4px; margin-top: 3px; }
    .med-card {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px;
      margin-bottom: 8px; cursor: pointer; transition: background 0.15s;
    }
    .med-card:hover { background: #f0fdf4; border-color: #5dcaa5; }
    .med-name { font-weight: 600; }
    .med-meta { margin-top: 4px; display: flex; gap: 6px; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .med-price { font-weight: 700; color: #0f6e56; }
    .cart { position: sticky; top: 0; }
    .cart-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 0; border-bottom: 1px solid #f3f4f6;
    }
    .btn-icon { background: none; border: none; color: #a32d2d; cursor: pointer; }
    .total-row { margin: 16px 0; padding: 12px; background: #f0fdf4; border-radius: 4px; text-align: right; font-size: 16px; }
    .field select { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; background: white; }
    .field select:focus { outline: none; border-color: #0f6e56; box-shadow: 0 0 0 2px rgba(15,110,86,0.15); }
    .btn-primary { width: 100%; padding: 12px 16px; }
    .success-msg { margin-top: 12px; padding: 8px; background: #d1fae5; color: #065f46; border-radius: 4px; font-size: 13px; }
    .receta-block { margin-top: 6px; padding: 8px; background: #fffbeb; border-radius: 4px; border: 1px solid #fde68a; }
    .receta-input { flex: 1 1 auto; min-width: 130px; font-size: 12px; padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace; }
    .btn-verify { background: #0f6e56; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; white-space: nowrap; }
    .btn-verify:disabled { opacity: 0.4; cursor: not-allowed; }
    .badge-green { background: #d1fae5; color: #065f46; font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
  `]
})
export class CajaComponent implements OnInit {
  private apollo = inject(Apollo);
  medicamentos: any[] = [];
  pacientes: any[] = [];
  carrito: CartItem[] = [];
  q = '';
  pacienteId: string | null = null;
  metodoPago = 'EFECTIVO';
  dejarPendiente = false;
  facturando = false;
  ultimaFactura: any = null;

  ngOnInit() {
    this.buscarMed();
    this.apollo.query<any>({ query: LIST_PACIENTES, variables: { q: null } })
      .subscribe(r => this.pacientes = r.data?.pacientes ?? []);
  }

  buscarMed() {
    this.apollo.query<any>({ query: LIST_MEDICAMENTOS, variables: { q: this.q || null, activo: true }, fetchPolicy: 'network-only' })
      .subscribe(r => this.medicamentos = r.data?.medicamentos ?? []);
  }

  agregar(m: any) {
    const exist = this.carrito.find(it => it.medicamentoId === m.id);
    if (exist) { exist.cantidad++; return; }
    this.carrito.push({
      medicamentoId: m.id, nombre: m.nombre,
      precio: Number(m.precioVenta), cantidad: 1,
      controlado: m.controlado, requiereReceta: m.requiereReceta
    });
  }

  quitar(i: number) { this.carrito.splice(i, 1); }

  total(): number {
    return this.carrito.reduce((s, it) => s + it.precio * it.cantidad, 0);
  }

  verificarRecetaItem(i: number) {
    const it = this.carrito[i];
    if (!it.recetaId) return;
    it.verificacion = { exists: false, loading: true };
    this.apollo.query<any>({
      query: VERIFICAR_RECETA,
      variables: { id: it.recetaId },
      fetchPolicy: 'network-only'
    }).subscribe({
      next: res => {
        const v = res.data?.verificarReceta;
        if (!v) { it.verificacion = { exists: false, error: 'Sin respuesta' }; return; }
        it.verificacion = {
          exists: v.exists,
          blockNumber: v.blockNumber,
          timestamp: v.timestamp,
          error: v.error || undefined,
          loading: false
        };
      },
      error: e => {
        it.verificacion = { exists: false, error: e.message, loading: false };
      }
    });
  }

  facturar() {
    this.facturando = true;
    const input = {
      pacienteId: this.pacienteId,
      metodoPago: this.metodoPago,
      descuento: 0,
      pendiente: this.dejarPendiente,
      items: this.carrito.map(it => ({
        medicamentoId: it.medicamentoId,
        cantidad: it.cantidad,
        recetaId: it.recetaId || null
      }))
    };
    this.apollo.mutate<any>({ mutation: CREATE_FACTURA, variables: { input } }).subscribe({
      next: r => {
        this.facturando = false;
        this.ultimaFactura = r.data?.crearFactura;
        this.carrito = [];
        this.buscarMed();
      },
      error: e => { this.facturando = false; alert('Error: ' + e.message); }
    });
  }
}
