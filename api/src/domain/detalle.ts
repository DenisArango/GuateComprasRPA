import { normalizar } from './texto.js';

/** Lo que VC.Concurso lee en la página de detalle de un concurso. */
export interface DetalleConcurso {
  titulo: string | null;
  entidad: string | null;
  unidadCompradora: string | null;
  modalidad: string | null;
  estadoGc: string | null;
  montoEstimado: number | null;
  /** Fecha y hora límite de presentación de ofertas (ISO) */
  fechaCierre: string | null;
  documentos: { nombre: string; publicadoEn: string | null }[];
  aclaraciones: number;
}

export type TipoDocumento = 'BASES' | 'ESPECIFICACIONES' | 'ANEXO' | 'ADENDA' | 'ACLARACION' | 'OTRO';
export type TipoCambio = 'DOCUMENTO' | 'FECHA' | 'ESTADO' | 'ACLARACION';

export interface Cambio {
  tipo: TipoCambio;
  antes: unknown;
  despues: unknown;
}

/** Tipo de documento por su nombre. El orden importa: "Adenda a las bases" es una adenda. */
const REGLAS_TIPO: [RegExp, TipoDocumento][] = [
  [/\badenda|\bmodificacion/, 'ADENDA'],
  [/\baclaraci|\brespuesta/, 'ACLARACION'],
  [/\bespecificacion|\bficha tecnica|\bterminos de referencia|\btdr\b/, 'ESPECIFICACIONES'],
  [/\bbases\b|\bdocumento base/, 'BASES'],
  [/\banexo|\bformulario|\bmodelo de/, 'ANEXO'],
];

export function clasificarDocumento(nombre: string): TipoDocumento {
  const n = normalizar(nombre).replace(/[_-]+/g, ' ');
  return REGLAS_TIPO.find(([regla]) => regla.test(n))?.[1] ?? 'OTRO';
}

/**
 * Cambios entre la instantánea anterior y el detalle recién leído (CU-02).
 * En la primera lectura no hay cambios: todo es información nueva.
 */
export function detectarCambios(anterior: DetalleConcurso | null, actual: DetalleConcurso): Cambio[] {
  if (!anterior) return [];
  const cambios: Cambio[] = [];

  if (actual.estadoGc && normalizar(actual.estadoGc) !== normalizar(anterior.estadoGc ?? '')) {
    cambios.push({ tipo: 'ESTADO', antes: anterior.estadoGc, despues: actual.estadoGc });
  }
  if (actual.fechaCierre && actual.fechaCierre !== anterior.fechaCierre) {
    cambios.push({ tipo: 'FECHA', antes: anterior.fechaCierre, despues: actual.fechaCierre });
  }

  const conocidos = new Set(anterior.documentos.map((d) => normalizar(d.nombre)));
  for (const documento of actual.documentos) {
    if (!conocidos.has(normalizar(documento.nombre))) {
      cambios.push({ tipo: 'DOCUMENTO', antes: null, despues: documento });
    }
  }

  if (actual.aclaraciones > anterior.aclaraciones) {
    cambios.push({ tipo: 'ACLARACION', antes: anterior.aclaraciones, despues: actual.aclaraciones });
  }
  return cambios;
}
