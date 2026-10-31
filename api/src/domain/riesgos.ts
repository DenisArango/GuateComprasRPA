/**
 * Banderas rojas sobre el histórico OCDS (docs/10-banderas-rojas.md).
 * Un indicador activado no implica irregularidad: señala un patrón que amerita revisión.
 * Umbrales y pesos son parámetros, no reglas de negocio fijas.
 */

export const AVISO_RIESGO =
  'Un indicador activado no implica irregularidad. Señala un patrón estadístico que puede tener explicaciones legítimas y que amerita revisión.';

export type CodigoIndicador = 'IR-01' | 'IR-02' | 'IR-03' | 'IR-04' | 'IR-05' | 'IR-08';

export interface DefinicionIndicador {
  codigo: CodigoIndicador;
  nombre: string;
  fase: string;
  explicacion: string;
}

export const INDICADORES: DefinicionIndicador[] = [
  { codigo: 'IR-01', nombre: 'Oferente único', fase: 'Adjudicación',
    explicacion: 'Cotización o licitación adjudicada con una sola oferta recibida. La competencia es lo que protege el precio; con un solo oferente no la hubo.' },
  { codigo: 'IR-02', nombre: 'Concentración proveedor-entidad', fase: 'Adjudicación',
    explicacion: 'Un proveedor recibe una parte alta del monto que una entidad adjudica en un año para un mismo tipo de compra.' },
  { codigo: 'IR-03', nombre: 'Plazo corto para ofertar', fase: 'Publicación',
    explicacion: 'El plazo entre la publicación y el cierre fue más corto que el de casi todos los procesos de la misma modalidad. Un plazo corto reduce quiénes alcanzan a ofertar.' },
  { codigo: 'IR-04', nombre: 'Posible fraccionamiento', fase: 'Planificación',
    explicacion: 'Varias compras directas de la misma unidad compradora, al mismo proveedor y del mismo producto el mismo día, que juntas superan el monto máximo de una compra directa. Partir una compra evita la cotización.' },
  { codigo: 'IR-05', nombre: 'Proveedor nuevo con contrato grande', fase: 'Adjudicación',
    explicacion: 'Primer contrato del proveedor en los datos disponibles y por un monto mayor que casi todas las adjudicaciones de la misma categoría y modalidad. Aproximación: OCDS no publica la fecha de inscripción en el RGAE.' },
  { codigo: 'IR-08', nombre: 'Desiertos seguidos de compra directa', fase: 'Entidad',
    explicacion: 'Adquisición directa por ausencia de oferta en una entidad que declara desiertos muchos más concursos que las demás.' },
];

export interface ParametrosRiesgo {
  pesos: Record<CodigoIndicador, number>;
  /** Modalidades competitivas (patrones ILIKE) */
  competitivas: string[];
  /** Modalidades que no son compras comparables (convenios, donaciones, arrendamientos, excepciones) */
  excluidas: string[];
  /** Compras directas y de baja cuantía (patrones ILIKE) */
  directas: string[];
  /** Monto máximo de la compra directa (LCE, valores vigentes en Guatecompras) */
  umbralCompraDirecta: number;
  concentracionMinima: number;
  concentracionMontoMinimo: number;
  concentracionProcesosMinimos: number;
  plazoPercentil: number;
  plazoProcesosMinimos: number;
  fraccionamientoDias: number;
  fraccionamientoCompras: number;
  proveedorNuevoPercentil: number;
  /** Días de historia previa necesarios para llamar "nuevo" a un proveedor */
  proveedorNuevoHistoriaDias: number;
  desiertosPercentil: number;
  desiertosProcesosMinimos: number;
}

export const PARAMETROS_RIESGO: ParametrosRiesgo = {
  pesos: { 'IR-01': 20, 'IR-02': 20, 'IR-03': 15, 'IR-04': 20, 'IR-05': 15, 'IR-08': 10 },
  competitivas: ['Cotización (Art. 38%', 'Licitación Pública (Art. 17%'],
  excluidas: ['Convenios y Tratados%', 'Donaciones%', 'Negociaciones entre Entidades%', 'Arrendamiento%', 'Procedimientos Regulados por el artículo 44%', 'Adquisiciones con proveedor único%'],
  directas: ['Compra Directa%', 'Baja Cuantía%', 'Compra de Baja Cuantía%'],
  umbralCompraDirecta: 90_000,
  concentracionMinima: 0.4,
  concentracionMontoMinimo: 900_000,
  concentracionProcesosMinimos: 3,
  plazoPercentil: 0.1,
  plazoProcesosMinimos: 30,
  /** Ventana en días calendario (1 = el mismo día). Con 90 días se marcaba el 90 % de las compras directas (docs/10). */
  fraccionamientoDias: 1,
  fraccionamientoCompras: 3,
  proveedorNuevoPercentil: 0.9,
  proveedorNuevoHistoriaDias: 365,
  desiertosPercentil: 0.9,
  desiertosProcesosMinimos: 10,
};

/** Puntaje compuesto 0–100: suma de pesos de los indicadores activados sobre la suma de todos los pesos (10.4). */
export function puntajeRiesgo(activados: string[], pesos: Record<string, number> = PARAMETROS_RIESGO.pesos): number {
  const total = Object.values(pesos).reduce((s, p) => s + p, 0);
  if (!total) return 0;
  const suma = [...new Set(activados)].reduce((s, c) => s + (pesos[c] ?? 0), 0);
  return Math.round((100 * suma) / total);
}

export const CATEGORIAS_OCDS: Record<string, string> = { goods: 'bienes', services: 'servicios', works: 'obras' };
