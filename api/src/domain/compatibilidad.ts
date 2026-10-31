import type { Ficha } from './ficha.js';
import { normalizar, palabrasEncontradas } from './texto.js';

/**
 * Compatibilidad completa entre un concurso con ficha y un perfil (CU-04, docs/09-ia-extraccion.md 9.6).
 * Puntaje 0–100 = Σ peso × valor (valor entre 0 y 1). Los pesos son parámetros, no constantes de negocio.
 */

export interface PesosCompatibilidad {
  categoria: number;
  contenido: number;
  departamento: number;
  monto: number;
  requisitos: number;
}

export const PESOS_COMPATIBILIDAD: PesosCompatibilidad = { categoria: 25, contenido: 30, departamento: 10, monto: 15, requisitos: 20 };

export interface PerfilCompatibilidad {
  id: number;
  categorias: string[];
  palabrasClave: string[];
  departamentos: string[];
  montoMin: number | null;
  montoMax: number | null;
  /** Documentos normalizados con su vencimiento (null = no vence) */
  documentos: { documento: string; venceEn: Date | null }[];
}

export interface ConcursoCompatibilidad {
  titulo: string;
  categorias: string[];
  /** Monto publicado en el portal, si existe */
  montoPortal: number | null;
  /** Fecha de cierre: los documentos deben estar vigentes hasta entonces */
  fechaCierre: Date | null;
}

export interface ResultadoCompatibilidad {
  puntaje: number;
  detalle: Record<keyof PesosCompatibilidad, number> & { palabras: string[] };
  faltantes: string[];
}

/** Documentos de la empresa vigentes a una fecha (RN-09). */
export function documentosVigentes(perfil: PerfilCompatibilidad, fecha: Date): Set<string> {
  return new Set(perfil.documentos.filter((d) => !d.venceEn || d.venceEn >= fecha).map((d) => d.documento));
}

/** Requisitos documentales obligatorios de la ficha que la empresa no tiene vigentes. */
export function faltantes(ficha: Ficha, perfil: PerfilCompatibilidad, fecha: Date): string[] {
  const vigentes = documentosVigentes(perfil, fecha);
  const requeridos = ficha.requisitos.filter((r) => r.obligatorio && r.documento && r.documento !== 'OTRO').map((r) => r.documento!);
  return [...new Set(requeridos)].filter((d) => !vigentes.has(d));
}

export function calcularCompatibilidad(
  ficha: Ficha,
  concurso: ConcursoCompatibilidad,
  perfil: PerfilCompatibilidad,
  hoy: Date,
  pesos: PesosCompatibilidad = PESOS_COMPATIBILIDAD,
): ResultadoCompatibilidad {
  const fechaReferencia = concurso.fechaCierre && concurso.fechaCierre > hoy ? concurso.fechaCierre : hoy;

  const categoriasPerfil = new Set(perfil.categorias.map(normalizar));
  const categoria = concurso.categorias.some((c) => categoriasPerfil.has(normalizar(c))) ? 1 : 0;

  // Contenido: palabras clave del perfil en el objeto, los ítems y el título (embeddings: pendiente, ADR-0005)
  const texto = [concurso.titulo, ficha.objeto, ...ficha.items.map((i) => i.descripcion)].join(' ');
  const palabras = palabrasEncontradas(texto, perfil.palabrasClave);
  const contenido = Math.min(1, palabras.length / 2);

  // Departamento: el lugar de entrega menciona alguno de los departamentos del perfil; sin dato, neutro
  const lugar = ficha.lugarEntrega ? normalizar(ficha.lugarEntrega) : null;
  const departamento =
    perfil.departamentos.length === 0 || lugar === null ? 0.5 : perfil.departamentos.some((d) => lugar.includes(normalizar(d))) ? 1 : 0;

  const monto = valorMonto(ficha.montoEstimado ?? concurso.montoPortal, perfil.montoMin, perfil.montoMax);

  const obligatorios = [...new Set(ficha.requisitos.filter((r) => r.obligatorio && r.documento && r.documento !== 'OTRO').map((r) => r.documento!))];
  const sinCubrir = faltantes(ficha, perfil, fechaReferencia);
  const requisitos = obligatorios.length === 0 ? 1 : (obligatorios.length - sinCubrir.length) / obligatorios.length;

  const detalle = { categoria, contenido, departamento, monto, requisitos };
  const puntaje = Math.round(
    (Object.keys(pesos) as (keyof PesosCompatibilidad)[]).reduce((suma, k) => suma + pesos[k] * detalle[k], 0),
  );
  return { puntaje, detalle: { ...detalle, palabras }, faltantes: sinCubrir };
}

/** Dentro del rango del perfil → 1; fuera, baja en proporción a la distancia; sin monto o sin rango → neutro. */
function valorMonto(monto: number | null, min: number | null, max: number | null): number {
  if (monto === null || (min === null && max === null)) return 0.5;
  if ((min === null || monto >= min) && (max === null || monto <= max)) return 1;
  const limite = min !== null && monto < min ? min : max!;
  return Math.max(0, 1 - Math.abs(monto - limite) / limite);
}
