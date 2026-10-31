import { NOMBRES_DOCUMENTOS } from './ficha.js';

/**
 * Checklist del expediente de oferta (CU-16, RF-EXP-02). Cruza los requisitos de la ficha con los
 * documentos que la empresa registró en su perfil, vigentes a la fecha de cierre del concurso (RN-09).
 */

export type EstadoRequisito = 'LISTO' | 'FALTANTE' | 'VENCIDO' | 'REVISAR';

export interface RequisitoExpediente {
  tipo: string;
  descripcion: string;
  documento: string | null;
  obligatorio: boolean;
  referencia: string | null;
}

export interface DocumentoDeEmpresa {
  documento: string;
  venceEn: Date | null;
}

export interface FilaChecklist {
  requisito: string;
  tipo: string;
  obligatorio: boolean;
  /** Código del catálogo (RTU, RGAE…); null si el requisito no es un documento del catálogo */
  documento: string | null;
  nombreDocumento: string | null;
  estado: EstadoRequisito;
  venceEn: string | null;
  referencia: string | null;
}

const nombre = (codigo: string) => NOMBRES_DOCUMENTOS[codigo as keyof typeof NOMBRES_DOCUMENTOS] ?? codigo;

/**
 * LISTO: la empresa tiene el documento vigente al cierre. VENCIDO: lo tiene pero vence antes (no se copia, CP-17).
 * FALTANTE: no lo tiene. REVISAR: el requisito no es un documento del catálogo y lo verifica la persona.
 */
export function checklist(requisitos: RequisitoExpediente[], documentos: DocumentoDeEmpresa[], fechaReferencia: Date): FilaChecklist[] {
  const porCodigo = new Map(documentos.map((d) => [d.documento, d]));
  return requisitos.map((r) => {
    const codigo = r.documento && r.documento !== 'OTRO' ? r.documento : null;
    const propio = codigo ? porCodigo.get(codigo) : undefined;
    const estado: EstadoRequisito = !codigo
      ? 'REVISAR'
      : !propio
        ? 'FALTANTE'
        : propio.venceEn && propio.venceEn < fechaReferencia
          ? 'VENCIDO'
          : 'LISTO';
    return {
      requisito: r.descripcion,
      tipo: r.tipo,
      obligatorio: r.obligatorio,
      documento: codigo,
      nombreDocumento: codigo ? nombre(codigo) : null,
      estado,
      venceEn: propio?.venceEn?.toISOString().slice(0, 10) ?? null,
      referencia: r.referencia,
    };
  });
}

/** Documentos obligatorios que faltan o están vencidos (sin repetir), para el resumen y el registro. */
export function faltantesDelChecklist(filas: FilaChecklist[]): string[] {
  return [...new Set(filas.filter((f) => f.obligatorio && f.documento && (f.estado === 'FALTANTE' || f.estado === 'VENCIDO')).map((f) => f.documento!))];
}

/** Códigos de los documentos de la empresa que se copian a la carpeta: los LISTO (los vencidos no se copian). */
export function documentosACopiar(filas: FilaChecklist[]): string[] {
  return [...new Set(filas.filter((f) => f.estado === 'LISTO' && f.documento).map((f) => f.documento!))];
}
