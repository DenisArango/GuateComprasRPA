import { z } from 'zod';

/**
 * Esquema de la ficha que extrae la IA (docs/09-ia-extraccion.md, 9.3).
 * Es la única definición: la API valida con él y publica su JSON Schema en
 * GET /robot/esquemas/ficha, que VC.Analisis usa como salida estructurada de Claude.
 * Objetos estrictos: la salida estructurada exige additionalProperties = false.
 */

export const DOCUMENTOS_NORMALIZADOS = [
  'RTU', 'RGAE', 'PATENTE_EMPRESA', 'PATENTE_SOCIEDAD', 'SOLVENCIA_FISCAL',
  'DPI_REPRESENTANTE', 'NOMBRAMIENTO', 'FIANZA_SOSTENIMIENTO', 'FIANZA_CUMPLIMIENTO',
  'DECLARACION_JURADA', 'CARTA_DISTRIBUIDOR', 'REGISTRO_SANITARIO', 'EXPERIENCIA',
  'ESTADOS_FINANCIEROS', 'OTRO',
] as const;

/** Nombres legibles del catálogo de documentos (docs/07-modelo-de-datos.md). */
export const NOMBRES_DOCUMENTOS: Record<(typeof DOCUMENTOS_NORMALIZADOS)[number], string> = {
  RTU: 'Registro Tributario Unificado (RTU)', RGAE: 'Constancia de inscripción en el RGAE', PATENTE_EMPRESA: 'Patente de comercio de empresa',
  PATENTE_SOCIEDAD: 'Patente de comercio de sociedad', SOLVENCIA_FISCAL: 'Solvencia fiscal', DPI_REPRESENTANTE: 'DPI del representante legal',
  NOMBRAMIENTO: 'Nombramiento del representante legal', FIANZA_SOSTENIMIENTO: 'Seguro de caución de sostenimiento', FIANZA_CUMPLIMIENTO: 'Seguro de caución de cumplimiento',
  DECLARACION_JURADA: 'Declaración jurada', CARTA_DISTRIBUIDOR: 'Carta de distribuidor autorizado', REGISTRO_SANITARIO: 'Registro sanitario',
  EXPERIENCIA: 'Constancias de experiencia', ESTADOS_FINANCIEROS: 'Estados financieros', OTRO: 'Otro',
};


const Pagina = z.number().int().positive().nullable().describe('Página del documento donde aparece el dato ([p. N]); null si no se puede ubicar');

export const Requisito = z.strictObject({
  tipo: z.enum(['legal', 'tecnico', 'financiero', 'experiencia', 'otro']),
  descripcion: z.string(),
  documento: z.enum(DOCUMENTOS_NORMALIZADOS).nullable().describe('Código del catálogo si el requisito es un documento; OTRO si no está en el catálogo; null si no es un documento'),
  obligatorio: z.boolean(),
  pagina: Pagina,
  posibleRestrictivo: z.boolean(),
  motivoRestrictivo: z.string().nullable(),
});

export const Ficha = z.strictObject({
  resumen: z.string().describe('3 a 5 oraciones en español sencillo: qué se compra, para quién, por cuánto, cuándo cierra y el requisito más exigente'),
  objeto: z.string(),
  items: z.array(z.strictObject({
    descripcion: z.string(),
    cantidad: z.number().nullable(),
    unidad: z.string().nullable(),
  })),
  montoEstimado: z.number().nullable().describe('Monto total estimado en quetzales'),
  moneda: z.enum(['GTQ']).nullable(),
  fechaLimiteOfertas: z.string().nullable().describe('Fecha y hora límite de presentación de ofertas, formato AAAA-MM-DDTHH:MM:SS'),
  plazoEntrega: z.string().nullable(),
  lugarEntrega: z.string().nullable(),
  requisitos: z.array(Requisito),
  garantias: z.array(z.strictObject({
    tipo: z.string(),
    porcentaje: z.number().nullable(),
    pagina: Pagina,
  })),
  criteriosCalificacion: z.array(z.strictObject({
    criterio: z.string(),
    ponderacion: z.number().nullable().describe('Puntos o porcentaje'),
    pagina: Pagina,
  })),
  formaPago: z.string().nullable(),
  observaciones: z.array(z.string()),
});

export type Ficha = z.infer<typeof Ficha>;

/**
 * Restricciones de JSON Schema que la salida estructurada de Claude no acepta
 * (por ejemplo, "For 'integer' type, properties exclusiveMinimum, maximum are not supported").
 * Se quitan del esquema que se envía a la IA; la validación completa la sigue haciendo Zod.
 */
const NO_SOPORTADAS = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', '$schema']);

function quitarNoSoportadas(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(quitarNoSoportadas);
  if (nodo && typeof nodo === 'object') {
    return Object.fromEntries(
      Object.entries(nodo).filter(([clave]) => !NO_SOPORTADAS.has(clave)).map(([clave, valor]) => [clave, quitarNoSoportadas(valor)]),
    );
  }
  return nodo;
}

/** JSON Schema de la ficha para la salida estructurada de Claude. */
export function esquemaFicha() {
  return quitarNoSoportadas(z.toJSONSchema(Ficha, { target: 'draft-2020-12' })) as Record<string, unknown>;
}

/** Validación con errores legibles, que el robot reenvía a Claude en el reintento (RF-IA-02). */
export function validarFicha(datos: unknown): { ok: true; ficha: Ficha } | { ok: false; errores: string[] } {
  const resultado = Ficha.safeParse(datos);
  if (resultado.success) {
    const errores = reglasAdicionales(resultado.data);
    return errores.length ? { ok: false, errores } : { ok: true, ficha: resultado.data };
  }
  return { ok: false, errores: resultado.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
}

/** Reglas que el JSON Schema no expresa. */
function reglasAdicionales(ficha: Ficha): string[] {
  const errores: string[] = [];
  const oraciones = ficha.resumen.split(/[.!?](\s|$)/).filter((o) => o.trim().length > 3).length;
  if (oraciones < 2 || ficha.resumen.length > 900) errores.push('resumen: debe tener entre 3 y 5 oraciones');
  if (ficha.fechaLimiteOfertas && Number.isNaN(Date.parse(ficha.fechaLimiteOfertas))) {
    errores.push('fechaLimiteOfertas: no es una fecha válida (AAAA-MM-DDTHH:MM:SS)');
  }
  ficha.requisitos.forEach((r, i) => {
    if (r.posibleRestrictivo && !r.motivoRestrictivo) errores.push(`requisitos.${i}.motivoRestrictivo: requerido si posibleRestrictivo es true`);
  });
  return errores;
}
