import { Pipe, type PipeTransform } from '@angular/core';
import type { EstadoSistema } from './modelos';

const quetzales = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entero = new Intl.NumberFormat('es-GT');
const fechaCorta = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fechaMedia = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Guatemala' });
const fechaLarga = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fechaHora = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Q180,000.00"; sin dato, una raya. */
export const formatoQuetzales = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : quetzales.format(Number(v));

export const formatoEntero = (v: number) => entero.format(v);

const compacto = new Intl.NumberFormat('es-GT', { notation: 'compact', maximumFractionDigits: 1 });
/** "Q 1.2 M": montos grandes en indicadores y gráficas. */
export const quetzalesCompactos = (v: number | null | undefined) => (v === null || v === undefined ? '—' : 'Q ' + compacto.format(v));

/** Días enteros desde hoy hasta la fecha (UTC, como se guardan las fechas de cierre). */
export function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  const inicio = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((new Date(fecha).getTime() - inicio) / 86_400_000);
}

/** "hoy", "mañana", "en 5 días", "cerró hace 2 días". */
export function textoCierre(fecha: string | null): string {
  const d = diasHasta(fecha);
  if (d === null) return 'sin fecha';
  if (d === 0) return 'cierra hoy';
  if (d === 1) return 'cierra mañana';
  if (d > 1) return `en ${d} días`;
  return d === -1 ? 'cerró ayer' : `cerró hace ${-d} días`;
}

export const NOMBRES_DOCUMENTO: Record<string, string> = {
  RTU: 'RTU', RGAE: 'Constancia RGAE', PATENTE_EMPRESA: 'Patente de empresa', PATENTE_SOCIEDAD: 'Patente de sociedad',
  SOLVENCIA_FISCAL: 'Solvencia fiscal', DPI_REPRESENTANTE: 'DPI del representante', NOMBRAMIENTO: 'Nombramiento',
  FIANZA_SOSTENIMIENTO: 'Fianza de sostenimiento', FIANZA_CUMPLIMIENTO: 'Fianza de cumplimiento', DECLARACION_JURADA: 'Declaración jurada',
  CARTA_DISTRIBUIDOR: 'Carta de distribuidor', REGISTRO_SANITARIO: 'Registro sanitario', EXPERIENCIA: 'Constancias de experiencia',
  ESTADOS_FINANCIEROS: 'Estados financieros', OTRO: 'Otro',
};

const ESTADOS: Record<EstadoSistema, { texto: string; tono: '' | 'positiva' | 'negativa' | 'aviso' | 'dato' }> = {
  PRESELECCIONADO: { texto: 'Preseleccionado', tono: '' },
  CAPTURADO: { texto: 'Documentos capturados', tono: '' },
  TEXTO_EXTRAIDO: { texto: 'En análisis', tono: '' },
  ANALIZADO: { texto: 'Ficha lista', tono: 'positiva' },
  REVISION_MANUAL: { texto: 'En revisión humana', tono: 'aviso' },
  NOTIFICADO: { texto: 'Notificado', tono: 'positiva' },
  CERRADO: { texto: 'Cerrado', tono: '' },
  FINALIZADO: { texto: 'Finalizado', tono: '' },
  ERROR_CAPTURA: { texto: 'Error de captura', tono: 'negativa' },
};

export const estadoConcurso = (e: EstadoSistema | null) => (e ? ESTADOS[e] : { texto: 'Sin procesar', tono: '' as const });

/** Modalidad sin el artículo de ley: "Cotización (Art. 38 LCE)" → "Cotización". */
export const modalidadCorta = (m: string) =>
  m.replace(/\s*\(.*\)\s*$/, '').replace(/\s+con oferta electr[oó]nica$/i, '').replace(/^Compra Directa$/, 'Compra directa');

const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'para', 'por', 'a', 'al', 'con', 'sin']);

/**
 * El portal publica títulos y entidades en MAYÚSCULAS. Si el texto está casi todo en mayúsculas:
 * entidades en tipo título ("Ministerio de Salud Pública"), títulos en tipo oración.
 * Las siglas entre guiones o paréntesis (-USAC-, (IGSS)) se conservan.
 */
export function legible(texto: string | null | undefined, modo: 'titulo' | 'entidad' = 'titulo'): string {
  if (!texto) return '';
  const letras = texto.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  if (!letras || letras.replace(/[^a-záéíóúñü]/g, '').length / letras.length > 0.3) return texto;
  let primera = true;
  return texto.replace(/[^\s]+/g, (palabra) => {
    if (/^[-(].*[-)][,.]?$/.test(palabra)) { primera = false; return palabra; }
    const m = palabra.toLocaleLowerCase('es');
    const esPrimera = primera;
    primera = /[.:;]$/.test(palabra);
    if (esPrimera || (modo === 'entidad' && !MENORES.has(m))) return m.replace(/\p{L}/u, (l) => l.toLocaleUpperCase('es'));
    return m;
  });
}

@Pipe({ name: 'legible' })
export class LegiblePipe implements PipeTransform { transform = legible; }

@Pipe({ name: 'quetzales' })
export class QuetzalesPipe implements PipeTransform { transform = formatoQuetzales; }

@Pipe({ name: 'fechaCorta' })
export class FechaCortaPipe implements PipeTransform {
  transform(v: string | null) { return v ? fechaCorta.format(new Date(v)).replace('.', '') : '—'; }
}

/** "12 sep 2025": fechas del histórico (con hora real, en hora de Guatemala). */
@Pipe({ name: 'fechaMedia' })
export class FechaMediaPipe implements PipeTransform {
  transform(v: string | null) { return v ? fechaMedia.format(new Date(v)).replace('.', '') : '—'; }
}

@Pipe({ name: 'fechaLarga' })
export class FechaLargaPipe implements PipeTransform {
  transform(v: string | null, conHora = false) { return v ? (conHora ? fechaHora.format(new Date(v)).replace('.', '') : fechaLarga.format(new Date(v))) : '—'; }
}

@Pipe({ name: 'cierre' })
export class CierrePipe implements PipeTransform { transform = textoCierre; }

@Pipe({ name: 'documento' })
export class DocumentoPipe implements PipeTransform { transform(c: string) { return NOMBRES_DOCUMENTO[c] ?? c; } }

@Pipe({ name: 'modalidad' })
export class ModalidadPipe implements PipeTransform { transform = modalidadCorta; }
