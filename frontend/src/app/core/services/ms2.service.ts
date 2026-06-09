import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { SupabaseService } from '../auth/supabase.service';
import { environment } from '../../../environments/environment';

/**
 * Cliente REST para MS2 (ms-diagnostico-ia). MS2 NO se federa en el gateway:
 * el frontend lo llama directo por REST. Cada request adjunta el JWT de Supabase.
 */
@Injectable({ providedIn: 'root' })
export class Ms2Service {
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

  // --- Pre-triaje (NLP) ---
  preTriaje(sintomas: string): Observable<any> {
    return this.withAuth(headers =>
      this.http.post(`${this.base}/api/chat-triaje`, { mensaje: sintomas }, { headers }));
  }

  // --- Diagnóstico IA ---
  diagnosticar(form: FormData): Observable<any> {
    return this.withAuth(headers =>
      this.http.post(`${this.base}/api/analizar-imagen`, form, { headers }));
  }

  listarDiagnosticos(pacienteId: string): Observable<any> {
    return this.withAuth(headers =>
      this.http.get(`${this.base}/api/resultados/paciente/${pacienteId}`, { headers }));
  }

  // --- Documentos (gestion documental basica) ---
  subirDocumento(form: FormData): Observable<any> {
    return this.withAuth(headers =>
      this.http.post(`${this.base}/api/documentos`, form, { headers }));
  }

  listarDocumentos(pacienteId: string): Observable<any> {
    return this.withAuth(headers =>
      this.http.get(`${this.base}/api/documentos`, { headers, params: { paciente_id: pacienteId } }));
  }
}
