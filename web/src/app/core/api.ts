import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  Bitacora, Catalogos, DetalleConcurso, EstadoTelegram, EstadoSeguimiento, FiltrosHistorial, HistorialConcurso, Oportunidad, PaginaProcesos, Panel, Perfil,
  PerfilProveedor, PerfilResumen, ProcesoRiesgo, RankingRiesgos, ResumenHistorial, Sesion, TableroRiesgos, Usuario,
} from './modelos';

/** Quita los filtros vacíos para no mandarlos en la URL. */
function parametros(f: FiltrosHistorial) {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && String(v).trim() !== '') p = p.set(k, String(v).trim());
  return p;
}

/** Cliente de las rutas /app/* de la API (en desarrollo, a través de proxy.conf.json). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  ingresar(correo: string, contrasena: string) {
    return this.http.post<Sesion>('/app/sesion', { correo, contrasena });
  }
  yo() {
    return this.http.get<Usuario>('/app/sesion');
  }
  perfiles() {
    return this.http.get<PerfilResumen[]>('/app/perfiles');
  }
  panel(perfilId: number) {
    return this.http.get<Panel>('/app/panel', { params: { perfilId } });
  }
  oportunidades(perfilId: number, vista: 'abiertas' | 'siguiendo' | 'todas', buscar = '') {
    let params = new HttpParams().set('perfilId', perfilId).set('vista', vista);
    if (buscar.trim()) params = params.set('buscar', buscar.trim());
    return this.http.get<Oportunidad[]>('/app/oportunidades', { params });
  }
  concurso(nog: string, perfilId: number) {
    return this.http.get<DetalleConcurso>(`/app/concursos/${nog}`, { params: { perfilId } });
  }
  seguir(nog: string, perfilId: number, estado: EstadoSeguimiento | null) {
    return this.http.put<{ estado: EstadoSeguimiento | null; expediente: 'INICIADO' | 'SIN_FICHA' | 'NO_DISPONIBLE' | null }>(`/app/concursos/${nog}/seguimiento`, { perfilId, estado });
  }
  calificar(nog: string, perfilId: number, relevante: boolean | null) {
    return this.http.put(`/app/concursos/${nog}/calificacion`, { perfilId, relevante });
  }
  documento(id: number) {
    return this.http.get(`/app/documentos/${id}/archivo`, { responseType: 'blob' });
  }
  perfil(id: number) {
    return this.http.get<Perfil>(`/app/perfiles/${id}`);
  }
  guardarPerfil(perfil: Perfil) {
    const { id, ...datos } = perfil;
    return this.http.put<{ id: number; recalculadas: number }>(`/app/perfiles/${id}`, datos);
  }
  catalogos() {
    return this.http.get<Catalogos>('/app/catalogos');
  }

  // Histórico OCDS y banderas rojas
  resumenHistorial() {
    return this.http.get<ResumenHistorial>('/app/historial/resumen');
  }
  historial(f: FiltrosHistorial) {
    return this.http.get<PaginaProcesos>('/app/historial', { params: parametros(f) });
  }
  proveedor(id: number) {
    return this.http.get<PerfilProveedor>(`/app/proveedores/${id}`);
  }
  riesgos(f: FiltrosHistorial) {
    return this.http.get<TableroRiesgos>('/app/riesgos', { params: parametros(f) });
  }
  ranking(f: FiltrosHistorial) {
    return this.http.get<RankingRiesgos>('/app/riesgos/ranking', { params: parametros(f) });
  }
  procesoRiesgo(ocid: string) {
    return this.http.get<ProcesoRiesgo>(`/app/riesgos/procesos/${ocid}`);
  }
  historialConcurso(nog: string) {
    return this.http.get<HistorialConcurso>(`/app/concursos/${nog}/historial`);
  }
  telegram(perfilId: number) {
    return this.http.get<EstadoTelegram>(`/app/perfiles/${perfilId}/telegram`);
  }
  vincularTelegram(perfilId: number) {
    return this.http.post<{ bot: string; enlace: string; venceEn: number }>(`/app/perfiles/${perfilId}/telegram`, {});
  }
  desvincularTelegram(perfilId: number) {
    return this.http.delete<void>(`/app/perfiles/${perfilId}/telegram`);
  }
  ejecuciones(dias: number) {
    return this.http.get<Bitacora>('/app/ejecuciones', { params: { dias } });
  }
  relanzar(proceso: string) {
    return this.http.post<{ id: number; estado: string }>('/app/ejecuciones', { proceso });
  }
  capturarNog(nog: string) {
    return this.http.post<{ elementoId: number; nog: string; yaRegistrado: boolean; titulo: string | null }>('/app/concursos/manual', { nog });
  }
}
