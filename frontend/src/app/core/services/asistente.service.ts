import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { SupabaseService } from '../auth/supabase.service';
import { environment } from '../../../environments/environment';

/**
 * Cliente del chatbot asistente (endpoint /api/chat-asistente de MS2).
 * Mismo patron que Ms2Service: REST directo con el JWT de Supabase adjunto.
 */

export interface RutaAsistente {
  path: string;
  titulo: string;
  descripcion: string;
}

export interface MensajeHistorial {
  rol: 'user' | 'assistant';
  contenido: string;
}

export interface ChatAsistenteResponse {
  respuesta: string;
  navegar_a: string | null;
  proveedor: string;
}

@Injectable({ providedIn: 'root' })
export class AsistenteService {
  private http = inject(HttpClient);
  private supabase = inject(SupabaseService);
  private base = environment.ms2Url;

  private withAuth<T>(fn: (headers: HttpHeaders) => Observable<T>): Observable<T> {
    return from(this.supabase.getAccessToken()).pipe(
      switchMap(token => {
        const headers = token
          ? new HttpHeaders({ Authorization: `Bearer ${token}` })
          : new HttpHeaders();
        return fn(headers);
      })
    );
  }

  chat(
    mensaje: string,
    historial: MensajeHistorial[],
    rolUsuario: string | null,
    rutas: RutaAsistente[]
  ): Observable<ChatAsistenteResponse> {
    return this.withAuth(headers =>
      this.http.post<ChatAsistenteResponse>(
        `${this.base}/api/chat-asistente`,
        { mensaje, historial, rol_usuario: rolUsuario, rutas },
        { headers }
      )
    );
  }
}
