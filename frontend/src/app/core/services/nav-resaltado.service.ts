import { Injectable, signal } from '@angular/core';

/**
 * Canal minimo entre el chatbot y el sidebar: cuando el asistente lleva al
 * usuario a una seccion, el item correspondiente del menu se resalta unos
 * segundos para que aprenda donde vive.
 */
@Injectable({ providedIn: 'root' })
export class NavResaltadoService {
  private _path = signal<string | null>(null);
  /** Path actualmente resaltado (o null). El sidebar lo lee en su template. */
  readonly path = this._path.asReadonly();

  private timer: ReturnType<typeof setTimeout> | undefined;

  resaltar(path: string, duracionMs = 5000): void {
    clearTimeout(this.timer);
    this._path.set(path);
    this.timer = setTimeout(() => this._path.set(null), duracionMs);
  }
}
