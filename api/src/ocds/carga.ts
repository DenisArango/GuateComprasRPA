import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import pg from 'pg';
import { config } from '../config.js';
import { normalizarRegistro, type AdjudicacionFila, type ProcesoFila, type ProveedorFila } from './normalizar.js';

/**
 * Carga de los datos abiertos OCDS de Guatecompras (CU-11, ADR-0001).
 * Fuente: OCP Data Registry (data.open-contracting.org, publicación 142), que republica a diario los datos
 * de ocds.guatecompras.gt como registros compilados por año (CC BY 4.0). El portal OCDS de Guatecompras
 * está detrás de Cloudflare y no se evade. Cada archivo anual pesa ~300 MB comprimido: se lee en flujo.
 */

export const URL_OCDS = (anio: number) => `https://data.open-contracting.org/en/publication/142/download?name=${anio}.jsonl.gz`;
const TAMANO_LOTE = 2000;
/** El archivo del año en curso se vuelve a descargar si tiene más de estos días (actualización semanal) */
const VIGENCIA_DIAS = 6;

export type Avance = (etapa: string, registros: number) => Promise<void> | void;

export async function descargar(anio: number, carpeta = path.join(config.STORAGE_DIR, 'ocds')): Promise<string> {
  await mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${anio}.jsonl.gz`);
  const existente = await stat(destino).catch(() => null);
  const esAnioEnCurso = anio === new Date().getFullYear();
  if (existente && (!esAnioEnCurso || Date.now() - existente.mtimeMs < VIGENCIA_DIAS * 86_400_000)) return destino;

  const respuesta = await fetch(URL_OCDS(anio), { redirect: 'follow' });
  if (!respuesta.ok || !respuesta.body) throw new Error(`OCDS ${anio}: la descarga respondió ${respuesta.status}`);
  const temporal = `${destino}.descarga`;
  await pipeline(Readable.fromWeb(respuesta.body as import('node:stream/web').ReadableStream), createWriteStream(temporal));
  await rename(temporal, destino);
  return destino;
}

/** Lee un archivo JSONL comprimido y guarda procesos, proveedores y adjudicaciones por lotes. Devuelve los registros leídos. */
export async function cargarArchivo(archivo: string, avance?: Avance): Promise<number> {
  const cliente = new pg.Client({ connectionString: config.DATABASE_URL });
  await cliente.connect();
  await cliente.query("SET TIME ZONE 'UTC'");
  let leidos = 0;
  let lote: ReturnType<typeof normalizarRegistro>[] = [];
  try {
    const lineas = createInterface({ input: createReadStream(archivo).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const linea of lineas) {
      if (!linea.trim()) continue;
      const fila = normalizarRegistro(JSON.parse(linea));
      if (fila) lote.push(fila);
      leidos++;
      if (lote.length >= TAMANO_LOTE) {
        await guardarLote(cliente, lote);
        lote = [];
        await avance?.(`cargando ${path.basename(archivo)}`, leidos);
      }
    }
    if (lote.length) await guardarLote(cliente, lote);
    await avance?.(`cargado ${path.basename(archivo)}`, leidos);
    return leidos;
  } finally {
    await cliente.end();
  }
}

async function guardarLote(cliente: pg.Client, lote: ReturnType<typeof normalizarRegistro>[]) {
  // Un ocid repetido en el mismo lote rompería el ON CONFLICT: queda el más reciente
  const procesos = new Map<string, ProcesoFila>();
  const adjudicaciones = new Map<string, AdjudicacionFila[]>();
  const proveedores = new Map<string, ProveedorFila>();
  for (const f of lote) {
    if (!f) continue;
    procesos.set(f.proceso.ocid, f.proceso);
    adjudicaciones.set(f.proceso.ocid, f.adjudicaciones);
    for (const p of f.proveedores) proveedores.set(p.identificador, p);
  }

  await cliente.query('BEGIN');
  try {
    await cliente.query(
      `INSERT INTO ocds_proceso (ocid, nog, comprador_id, comprador_nombre, unidad_id, unidad_nombre, titulo, modalidad, categoria, clasificaciones,
         fecha_publicacion, inicio_ofertas, fin_ofertas, numero_ofertas, estado, actualizado_en)
       SELECT ocid, nog, comprador_id, comprador_nombre, unidad_id, unidad_nombre, titulo, modalidad, categoria, clasificaciones,
         fecha_publicacion, inicio_ofertas, fin_ofertas, numero_ofertas, estado, actualizado_en
       FROM jsonb_populate_recordset(null::ocds_proceso, $1::jsonb)
       ON CONFLICT (ocid) DO UPDATE SET
         nog = EXCLUDED.nog, comprador_id = EXCLUDED.comprador_id, comprador_nombre = EXCLUDED.comprador_nombre,
         unidad_id = EXCLUDED.unidad_id, unidad_nombre = EXCLUDED.unidad_nombre,
         titulo = EXCLUDED.titulo, modalidad = EXCLUDED.modalidad, categoria = EXCLUDED.categoria,
         clasificaciones = EXCLUDED.clasificaciones, fecha_publicacion = EXCLUDED.fecha_publicacion,
         inicio_ofertas = EXCLUDED.inicio_ofertas, fin_ofertas = EXCLUDED.fin_ofertas, numero_ofertas = EXCLUDED.numero_ofertas,
         estado = EXCLUDED.estado, actualizado_en = EXCLUDED.actualizado_en
       WHERE ocds_proceso.actualizado_en IS NULL OR EXCLUDED.actualizado_en >= ocds_proceso.actualizado_en OR ocds_proceso.unidad_id IS NULL`,
      [JSON.stringify([...procesos.values()])],
    );
    if (proveedores.size) {
      await cliente.query(
        `INSERT INTO proveedor (identificador, nit, nombre, tipo)
         SELECT identificador, nit, nombre, tipo FROM jsonb_populate_recordset(null::proveedor, $1::jsonb)
         ON CONFLICT (identificador) DO UPDATE SET nit = EXCLUDED.nit, nombre = EXCLUDED.nombre, tipo = COALESCE(EXCLUDED.tipo, proveedor.tipo)`,
        [JSON.stringify([...proveedores.values()])],
      );
    }
    // Las adjudicaciones se reemplazan completas por proceso
    await cliente.query(
      `DELETE FROM ocds_adjudicacion WHERE proceso_id IN (SELECT id FROM ocds_proceso WHERE ocid = ANY($1::text[]))`,
      [[...procesos.keys()]],
    );
    const filas = [...adjudicaciones.values()].flat();
    if (filas.length) {
      await cliente.query(
        `INSERT INTO ocds_adjudicacion (proceso_id, proveedor_id, monto, fecha, estado)
         SELECT p.id, v.id, x.monto, x.fecha, x.estado
         FROM jsonb_to_recordset($1::jsonb) AS x(ocid text, identificador text, monto numeric, fecha timestamp, estado text)
         JOIN ocds_proceso p ON p.ocid = x.ocid
         JOIN proveedor v ON v.identificador = x.identificador`,
        [JSON.stringify(filas)],
      );
    }
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  }
}
