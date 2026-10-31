import { PESOS_PRESELECCION } from './preseleccion.js';

/**
 * Reglas de qué se notifica (RF-NOT, RN-03, RN-04). La API decide el contenido;
 * VC.Notificador solo arma el correo y lo envía.
 */

export type Etapa = 'PRELIMINAR' | 'COMPLETA';

/** Días enteros entre dos fechas, tomando solo el día (UTC, como se guardan las fechas de cierre). */
export function diasEntre(desde: Date, hasta: Date): number {
  const d = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const h = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((h - d) / 86_400_000);
}

/** El puntaje completo usa el umbral del perfil; el preliminar, el de preselección. */
export function umbralDeEtapa(etapa: Etapa, umbralPerfil: number): number {
  return etapa === 'COMPLETA' ? umbralPerfil : PESOS_PRESELECCION.umbral;
}

/** Por concurso, la coincidencia completa si existe; si no, la preliminar. */
export function mejorPorConcurso<T extends { concursoId: number; etapa: Etapa }>(coincidencias: T[]): T[] {
  const porConcurso = new Map<number, T>();
  for (const c of coincidencias) {
    const actual = porConcurso.get(c.concursoId);
    if (!actual || c.etapa === 'COMPLETA') porConcurso.set(c.concursoId, c);
  }
  return [...porConcurso.values()];
}

interface CandidataResumen {
  concursoId: number;
  etapa: Etapa;
  puntaje: number;
  notificado: boolean;
  fechaCierre: Date | null;
  descartado: boolean;
}

/**
 * Oportunidades nuevas del resumen diario: sobre el umbral (RN-03), con cierre vigente (RN-04),
 * no descartadas por la empresa y no enviadas antes. Las de mayor puntaje primero.
 */
export function oportunidadesNuevas<T extends CandidataResumen>(coincidencias: T[], umbralPerfil: number, hoy: Date): T[] {
  return mejorPorConcurso(coincidencias)
    .filter((c) => !c.notificado && !c.descartado)
    .filter((c) => c.fechaCierre === null || diasEntre(hoy, c.fechaCierre) >= 0)
    .filter((c) => c.puntaje >= umbralDeEtapa(c.etapa, umbralPerfil))
    .sort((a, b) => b.puntaje - a.puntaje || (a.fechaCierre?.getTime() ?? Infinity) - (b.fechaCierre?.getTime() ?? Infinity));
}

/** Recordatorio de cierre (RF-NOT-04): exactamente N días antes, con N de la configuración (por defecto 3 y 1). */
export function tocaRecordatorio(fechaCierre: Date | null, hoy: Date, diasAviso: number[]): number | null {
  if (!fechaCierre) return null;
  const d = diasEntre(hoy, fechaCierre);
  return diasAviso.includes(d) ? d : null;
}

/** Documentos de la empresa que vencen dentro de la ventana (incluye hoy); los ya vencidos no se repiten. */
export function documentosPorVencer<T extends { venceEn: Date | null }>(documentos: T[], hoy: Date, ventanaDias: number) {
  return documentos
    .map((d) => ({ ...d, dias: d.venceEn ? diasEntre(hoy, d.venceEn) : null }))
    .filter((d): d is T & { dias: number } => d.dias !== null && d.dias >= 0 && d.dias <= ventanaDias)
    .sort((a, b) => a.dias - b.dias);
}
