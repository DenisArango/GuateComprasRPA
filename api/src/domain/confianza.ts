import type { Ficha } from './ficha.js';
import { normalizar } from './texto.js';

/**
 * Confianza de la ficha (docs/09-ia-extraccion.md, "Confianza de la ficha").
 * No la reporta el modelo: se calcula con verificaciones objetivas contra el portal y el texto.
 * Si falta el dato de referencia (por ejemplo, el portal no publica monto), ese componente
 * se excluye y los pesos restantes se reescalan.
 */

export interface PesosConfianza {
  fecha: number;
  monto: number;
  paginas: number;
  completitud: number;
}

export const PESOS_CONFIANZA: PesosConfianza = { fecha: 0.3, monto: 0.2, paginas: 0.3, completitud: 0.2 };

export interface ReferenciaPortal {
  /** Fecha de cierre leída del portal (AAAA-MM-DD...) */
  fechaCierre: string | null;
  montoEstimado: number | null;
}

/** Texto del documento por número de página. */
export type TextoPorPagina = ReadonlyMap<number, string>;

export interface ResultadoConfianza {
  confianza: number;
  componentes: Partial<Record<keyof PesosConfianza, number>>;
}

export function calcularConfianza(
  ficha: Ficha,
  portal: ReferenciaPortal,
  paginas: TextoPorPagina,
  pesos: PesosConfianza = PESOS_CONFIANZA,
): ResultadoConfianza {
  const componentes: ResultadoConfianza['componentes'] = {};

  // Si las bases no traen la fecha (null), no hay contra qué comparar: rige la del portal
  if (portal.fechaCierre && ficha.fechaLimiteOfertas) {
    componentes.fecha = ficha.fechaLimiteOfertas.slice(0, 10) === portal.fechaCierre.slice(0, 10) ? 1 : 0;
  }
  if (portal.montoEstimado) {
    componentes.monto =
      ficha.montoEstimado !== null && Math.abs(ficha.montoEstimado - portal.montoEstimado) <= portal.montoEstimado * 0.01 ? 1 : 0;
  }

  const citas = [
    ...ficha.requisitos.map((r) => ({ pagina: r.pagina, texto: r.descripcion })),
    ...ficha.garantias.map((g) => ({ pagina: g.pagina, texto: g.tipo })),
    ...ficha.criteriosCalificacion.map((c) => ({ pagina: c.pagina, texto: c.criterio })),
  ];
  // Una página escaneada existe pero no tiene texto (Claude la leyó como PDF): no se puede verificar, se excluye.
  // Una página que no existe sí cuenta como cita incorrecta.
  const verificables = citas.filter((c) => c.pagina === null || !paginaSinTexto(c.pagina, paginas));
  if (verificables.length > 0 && paginas.size > 0) {
    componentes.paginas = verificables.filter((c) => citaVerificable(c.pagina, c.texto, paginas)).length / verificables.length;
  }

  componentes.completitud = ficha.requisitos.length > 0 && ficha.criteriosCalificacion.length > 0 ? 1 : 0;

  const usados = Object.keys(componentes) as (keyof PesosConfianza)[];
  const total = usados.reduce((suma, k) => suma + pesos[k], 0);
  let confianza = usados.reduce((suma, k) => suma + pesos[k] * componentes[k]!, 0) / total;
  // Sin ninguna verificación contra el portal o el texto, la ficha no se da por buena sola
  if (usados.length === 1) confianza = Math.min(confianza, CONFIANZA_SIN_VERIFICACION);
  return { confianza: Math.round(confianza * 100) / 100, componentes };
}

/** Tope de la confianza cuando solo se pudo medir la completitud (por ejemplo, bases escaneadas sin fecha). */
export const CONFIANZA_SIN_VERIFICACION = 0.5;

function paginaSinTexto(pagina: number, paginas: TextoPorPagina): boolean {
  const contenido = paginas.get(pagina);
  return contenido !== undefined && contenido.trim().length === 0;
}

/** La página citada existe y contiene al menos una palabra significativa del dato extraído. */
function citaVerificable(pagina: number | null, texto: string, paginas: TextoPorPagina): boolean {
  if (pagina === null) return false;
  const contenido = paginas.get(pagina);
  if (!contenido) return false;
  const normalizado = normalizar(contenido);
  return normalizar(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 5)
    .some((p) => normalizado.includes(p));
}

/** Separa un texto marcado con "[p. N]" (formato que arma VC.Analisis) en páginas. */
export function paginasDeTexto(texto: string): Map<number, string> {
  const paginas = new Map<number, string>();
  const partes = texto.split(/\[p\. (\d+)\]/);
  for (let i = 1; i < partes.length; i += 2) {
    const numero = Number(partes[i]);
    paginas.set(numero, (paginas.get(numero) ?? '') + (partes[i + 1] ?? ''));
  }
  return paginas;
}
