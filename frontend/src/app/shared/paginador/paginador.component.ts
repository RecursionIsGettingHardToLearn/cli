import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Paginador reutilizable (client-side).
 *
 * Uso tipico en un componente de lista:
 *   pagina = 1; porPagina = 10;
 *   get pacientesPagina() { return paginar(this.pacientes, this.pagina, this.porPagina); }
 *   <tr *ngFor="let p of pacientesPagina"> ...
 *   <app-paginador [total]="pacientes.length" [pagina]="pagina" [porPagina]="porPagina"
 *                  (paginaChange)="pagina = $event"></app-paginador>
 *
 * Recordar resetear `pagina = 1` cuando cambia el filtro/busqueda.
 */
export function paginar<T>(items: T[], pagina: number, porPagina: number): T[] {
  const inicio = (pagina - 1) * porPagina;
  return items.slice(inicio, inicio + porPagina);
}

@Component({
  selector: 'app-paginador',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="paginador" *ngIf="total > 0">
      <span class="pag-info">
        Mostrando {{ desde }}–{{ hasta }} de {{ total }}
      </span>

      <div class="pag-controles">
        <button type="button" class="pag-btn" (click)="ir(1)" [disabled]="pagina <= 1"
                aria-label="Primera página">«</button>
        <button type="button" class="pag-btn" (click)="ir(pagina - 1)" [disabled]="pagina <= 1"
                aria-label="Página anterior">‹</button>

        <button type="button" class="pag-btn pag-num" *ngFor="let p of paginasVisibles"
                [class.activa]="p === pagina" (click)="ir(p)">{{ p }}</button>

        <button type="button" class="pag-btn" (click)="ir(pagina + 1)" [disabled]="pagina >= totalPaginas"
                aria-label="Página siguiente">›</button>
        <button type="button" class="pag-btn" (click)="ir(totalPaginas)" [disabled]="pagina >= totalPaginas"
                aria-label="Última página">»</button>
      </div>

      <label class="pag-size">
        Por página:
        <select [value]="porPagina" (change)="cambiarTamano($event)">
          <option *ngFor="let n of tamanos" [value]="n">{{ n }}</option>
        </select>
      </label>
    </div>
  `,
  styles: [`
    .paginador {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 10px; padding: 12px 4px 2px; margin-top: 6px; border-top: 1px solid #e5e7eb;
      font-size: 13px; color: #6b7280;
    }
    .pag-controles { display: flex; gap: 4px; }
    .pag-btn {
      min-width: 32px; height: 32px; padding: 0 8px; border: 1px solid #d1d5db;
      background: #fff; border-radius: 7px; cursor: pointer; font-size: 13px;
      color: #374151; transition: background .12s, border-color .12s;
    }
    .pag-btn:hover:not(:disabled) { background: #f0fdf9; border-color: #0f6e56; }
    .pag-btn:disabled { opacity: .4; cursor: default; }
    .pag-btn.activa { background: #0f6e56; border-color: #0f6e56; color: #fff; font-weight: 700; }
    .pag-size select {
      margin-left: 6px; padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 7px;
      background: #fff; color: #374151; font-size: 13px;
    }
    @media (max-width: 560px) { .paginador { justify-content: center; } }
  `],
})
export class PaginadorComponent {
  @Input() total = 0;
  @Input() pagina = 1;
  @Input() porPagina = 10;
  @Input() tamanos: number[] = [5, 10, 20, 50];
  @Output() paginaChange = new EventEmitter<number>();
  @Output() porPaginaChange = new EventEmitter<number>();

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }
  get desde(): number {
    return this.total === 0 ? 0 : (this.pagina - 1) * this.porPagina + 1;
  }
  get hasta(): number {
    return Math.min(this.pagina * this.porPagina, this.total);
  }
  /** Ventana de hasta 5 numeros centrada en la pagina actual. */
  get paginasVisibles(): number[] {
    const tp = this.totalPaginas;
    let inicio = Math.max(1, this.pagina - 2);
    const fin = Math.min(tp, inicio + 4);
    inicio = Math.max(1, fin - 4);
    const out: number[] = [];
    for (let p = inicio; p <= fin; p++) out.push(p);
    return out;
  }

  ir(p: number): void {
    const destino = Math.min(Math.max(1, p), this.totalPaginas);
    if (destino !== this.pagina) this.paginaChange.emit(destino);
  }

  cambiarTamano(ev: Event): void {
    const n = Number((ev.target as HTMLSelectElement).value);
    this.porPaginaChange.emit(n);
    this.paginaChange.emit(1);
  }
}
