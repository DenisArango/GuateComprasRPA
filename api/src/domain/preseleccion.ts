import { normalizar, palabrasEncontradas } from './texto.js';

/**
 * Preselección con los datos del boletín diario (docs/adr/0006-boletin-y-robot-atendido.md).
 * El boletín no trae monto ni requisitos: el puntaje preliminar solo usa categoría,
 * palabras clave y modalidad. La compatibilidad completa se calcula con la ficha de la IA.
 */

export interface ConcursoBoletin {
  nog: string;
  fechaCierre: Date | null;
  modalidad: string;
  categorias: string[];
  descripcion: string;
}

export interface PerfilPreseleccion {
  id: number;
  categorias: string[];
  palabrasClave: string[];
  /** Prefijos de modalidad aceptados; vacío = todas. */
  modalidades: string[];
}

/** Pesos parametrizados (regla del proyecto: no codificar pesos en la lógica). */
export interface PesosPreseleccion {
  categoria: number;
  palabraClave: number;
  palabraClaveAdicional: number;
  /** Puntaje mínimo para ser candidato. */
  umbral: number;
}

export const PESOS_PRESELECCION: PesosPreseleccion = {
  categoria: 40,
  palabraClave: 50,
  palabraClaveAdicional: 10,
  umbral: 50,
};

export interface ResultadoPreseleccion {
  perfilId: number;
  puntaje: number;
  detalle: { categoria: number; palabrasClave: number; palabras: string[] };
}

/**
 * Puntaje preliminar de un concurso para un perfil, o null si no aplica.
 * Con los pesos por defecto, la categoría sola (40) no alcanza el umbral (50): hace falta
 * al menos una palabra clave. Así se descartan, por ejemplo, las compras de alimentos que
 * los hospitales publican en la categoría de Salud.
 */
export function puntuar(
  concurso: ConcursoBoletin,
  perfil: PerfilPreseleccion,
  hoy: Date,
  pesos: PesosPreseleccion = PESOS_PRESELECCION,
): ResultadoPreseleccion | null {
  if (concurso.fechaCierre && concurso.fechaCierre < inicioDelDia(hoy)) return null;

  const modalidad = normalizar(concurso.modalidad);
  if (perfil.modalidades.length > 0 && !perfil.modalidades.some((m) => modalidad.startsWith(normalizar(m)))) {
    return null;
  }

  const categoriasPerfil = new Set(perfil.categorias.map(normalizar));
  const categoria = concurso.categorias.some((c) => categoriasPerfil.has(normalizar(c))) ? pesos.categoria : 0;

  const palabras = palabrasEncontradas(concurso.descripcion, perfil.palabrasClave);
  const palabrasClave =
    palabras.length === 0 ? 0 : pesos.palabraClave + pesos.palabraClaveAdicional * Math.min(palabras.length - 1, 1);

  const puntaje = Math.min(100, categoria + palabrasClave);
  if (puntaje < pesos.umbral) return null;
  return { perfilId: perfil.id, puntaje, detalle: { categoria, palabrasClave, palabras } };
}

export interface Candidato {
  nog: string;
  puntaje: number;
  resultados: ResultadoPreseleccion[];
}

/** Candidatos del día ordenados por puntaje, con el tope diario (PRESELECCION_MAX_DIARIO). */
export function preseleccionar(
  concursos: readonly ConcursoBoletin[],
  perfiles: readonly PerfilPreseleccion[],
  hoy: Date,
  maximo: number,
  pesos: PesosPreseleccion = PESOS_PRESELECCION,
): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const concurso of concursos) {
    const resultados = perfiles
      .map((p) => puntuar(concurso, p, hoy, pesos))
      .filter((r): r is ResultadoPreseleccion => r !== null);
    if (resultados.length > 0) {
      candidatos.push({ nog: concurso.nog, puntaje: Math.max(...resultados.map((r) => r.puntaje)), resultados });
    }
  }
  return candidatos.sort((a, b) => b.puntaje - a.puntaje).slice(0, maximo);
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}
