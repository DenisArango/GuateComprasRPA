import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AVISO_RIESGO, CATEGORIAS_OCDS, INDICADORES, PARAMETROS_RIESGO } from '../../domain/riesgos.js';
import { Prisma } from '../../generated/prisma/client.js';
import { exigirSesion } from './autenticacion.js';

/** Historial OCDS (CU-09) y banderas rojas (CU-10). Datos abiertos de Guatecompras, solo lectura. */

const POR_PAGINA = 25;
const urlGuatecompras = (nog: string | null) => (nog ? `https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog=${nog}` : null);

const Filtros = z.object({
  buscar: z.string().trim().max(120).optional(),
  entidad: z.string().trim().max(160).optional(),
  proveedor: z.string().trim().max(160).optional(),
  modalidad: z.string().trim().max(160).optional(),
  indicador: z.enum(INDICADORES.map((i) => i.codigo) as [string, ...string[]]).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Solo procesos adjudicados (por defecto en el historial: la pregunta es quién ganó y a qué precio) */
  adjudicados: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).max(400).default(1),
});
type Filtros = z.infer<typeof Filtros>;

/** Condiciones SQL de los filtros comunes (parametrizadas). */
function condiciones(f: Filtros, soloConIndicadores = false) {
  const c: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.buscar) c.push(/^\d{6,}$/.test(f.buscar) ? Prisma.sql`p.nog = ${f.buscar}` : Prisma.sql`p.titulo ILIKE ${'%' + f.buscar + '%'}`);
  if (f.entidad) c.push(Prisma.sql`p.comprador_nombre ILIKE ${'%' + f.entidad + '%'}`);
  if (f.modalidad) c.push(Prisma.sql`p.modalidad ILIKE ${f.modalidad + '%'}`);
  if (f.desde) c.push(Prisma.sql`p.fecha_publicacion >= ${new Date(`${f.desde}T00:00:00Z`)}`);
  if (f.hasta) c.push(Prisma.sql`p.fecha_publicacion < ${new Date(new Date(`${f.hasta}T00:00:00Z`).getTime() + 86_400_000)}`);
  if (f.proveedor) {
    c.push(/^\d+[kK]?$/.test(f.proveedor)
      ? Prisma.sql`EXISTS (SELECT 1 FROM ocds_adjudicacion a JOIN proveedor v ON v.id = a.proveedor_id WHERE a.proceso_id = p.id AND v.nit = ${f.proveedor.toUpperCase()})`
      : Prisma.sql`EXISTS (SELECT 1 FROM ocds_adjudicacion a JOIN proveedor v ON v.id = a.proveedor_id WHERE a.proceso_id = p.id AND v.nombre ILIKE ${'%' + f.proveedor + '%'})`);
  }
  if (f.adjudicados === 'true') c.push(Prisma.sql`p.estado = 'Adjudicado'`);
  if (f.indicador) c.push(Prisma.sql`EXISTS (SELECT 1 FROM indicador_riesgo i WHERE i.proceso_id = p.id AND i.codigo = ${f.indicador})`);
  else if (soloConIndicadores) c.push(Prisma.sql`p.puntaje_riesgo > 0`);
  return Prisma.join(c, ' AND ');
}

interface FilaProceso {
  id: number; ocid: string; nog: string | null; titulo: string; entidad: string; modalidad: string; categoria: string | null;
  fecha_publicacion: Date | null; estado: string | null; numero_ofertas: number | null; puntaje_riesgo: number;
  monto: Prisma.Decimal | null; proveedores: { id: number; nombre: string }[] | null; codigos: string[] | null;
}

/** Procesos con su monto adjudicado, proveedores e indicadores. */
async function procesos(where: Prisma.Sql, orden: Prisma.Sql, pagina: number) {
  const [filas, [{ total }]] = await Promise.all([
    prisma.$queryRaw<FilaProceso[]>`
      SELECT p.id, p.ocid, p.nog, p.titulo, p.comprador_nombre AS entidad, p.modalidad, p.categoria, p.fecha_publicacion, p.estado,
        p.numero_ofertas, p.puntaje_riesgo,
        (SELECT sum(a.monto) FROM ocds_adjudicacion a WHERE a.proceso_id = p.id AND a.estado = 'active') AS monto,
        (SELECT json_agg(DISTINCT jsonb_build_object('id', v.id, 'nombre', v.nombre)) FROM ocds_adjudicacion a JOIN proveedor v ON v.id = a.proveedor_id
           WHERE a.proceso_id = p.id AND a.estado = 'active') AS proveedores,
        (SELECT array_agg(i.codigo ORDER BY i.codigo) FROM indicador_riesgo i WHERE i.proceso_id = p.id) AS codigos
      FROM ocds_proceso p WHERE ${where} ORDER BY ${orden} LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM ocds_proceso p WHERE ${where}`,
  ]);
  return {
    total: Number(total),
    pagina,
    porPagina: POR_PAGINA,
    procesos: filas.map((f) => ({
      ocid: f.ocid, nog: f.nog, titulo: f.titulo, entidad: f.entidad, modalidad: f.modalidad,
      categoria: f.categoria ? CATEGORIAS_OCDS[f.categoria] ?? f.categoria : null,
      fechaPublicacion: f.fecha_publicacion, estado: f.estado, numeroOfertas: f.numero_ofertas, puntajeRiesgo: f.puntaje_riesgo,
      monto: f.monto === null ? null : Number(f.monto), proveedores: f.proveedores ?? [], indicadores: f.codigos ?? [],
    })),
  };
}

const VACIAS = new Set(['para', 'de', 'del', 'los', 'las', 'con', 'por', 'una', 'uso', 'que', 'adquisicion', 'adquisición', 'compra', 'contratacion',
  'contratación', 'servicio', 'servicios', 'suministro', 'institucion', 'institución', 'personal', 'diferentes', 'codigo', 'código', 'igss', 'pedido']);

/** Hasta 3 palabras largas y poco comunes del título, sin números ni palabras genéricas de compras. */
export function palabrasClave(titulo: string): string[] {
  const palabras = titulo.toLowerCase().split(/[^a-záéíóúñü]+/).filter((w) => w.length >= 5 && !VACIAS.has(w));
  return [...new Set(palabras)].sort((a, b) => b.length - a.length).slice(0, 3);
}

export async function rutasHistorialApp(app: FastifyInstance) {
  app.addHook('onRequest', exigirSesion);

  /** Estado del histórico: rango de fechas, totales y última carga. */
  app.get('/app/historial/resumen', async () => {
    const [[r], carga] = await Promise.all([
      prisma.$queryRaw<{ procesos: bigint; desde: Date | null; hasta: Date | null; proveedores: bigint; con_indicadores: bigint }[]>`
        SELECT count(*) AS procesos, min(fecha_publicacion) AS desde, max(fecha_publicacion) AS hasta,
          (SELECT count(*) FROM proveedor) AS proveedores, count(*) FILTER (WHERE puntaje_riesgo > 0) AS con_indicadores
        FROM ocds_proceso`,
      prisma.ocdsCarga.findFirst({ where: { estado: 'EXITOSA' }, orderBy: { id: 'desc' }, select: { fin: true, anios: true } }),
    ]);
    return {
      procesos: Number(r.procesos), proveedores: Number(r.proveedores), conIndicadores: Number(r.con_indicadores),
      desde: r.desde, hasta: r.hasta, ultimaCarga: carga?.fin ?? null,
      fuente: 'Datos abiertos OCDS de Guatecompras (Ministerio de Finanzas Públicas), vía OCP Data Registry. Licencia CC BY 4.0.',
    };
  });

  /** CU-09 · búsqueda de procesos históricos por palabra, entidad, proveedor, modalidad y fechas (RF-WEB-06). */
  app.get('/app/historial', async (request) => {
    const f = Filtros.parse(request.query);
    return procesos(condiciones({ ...f, adjudicados: f.adjudicados ?? 'true' }), Prisma.sql`p.fecha_publicacion DESC NULLS LAST, p.id DESC`, f.pagina);
  });

  /** CU-09 · perfil de un proveedor (RF-OCDS-04): totales, evolución por año y principales entidades. */
  app.get('/app/proveedores/:id', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const proveedor = await prisma.proveedor.findUnique({ where: { id } });
    if (!proveedor) return reply.code(404).send({ error: 'Proveedor no encontrado' });
    const activas = Prisma.sql`a.proveedor_id = ${id} AND a.estado = 'active' AND p.estado = 'Adjudicado'`;
    const [[totales], porAnio, entidades, recientes] = await Promise.all([
      prisma.$queryRaw<{ monto: Prisma.Decimal | null; procesos: bigint; entidades: bigint; desde: Date | null; hasta: Date | null; con_indicadores: bigint }[]>`
        SELECT sum(a.monto) AS monto, count(DISTINCT p.id) AS procesos, count(DISTINCT p.comprador_id) AS entidades,
          min(coalesce(a.fecha, p.fecha_publicacion)) AS desde, max(coalesce(a.fecha, p.fecha_publicacion)) AS hasta,
          count(DISTINCT p.id) FILTER (WHERE p.puntaje_riesgo > 0) AS con_indicadores
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id WHERE ${activas}`,
      prisma.$queryRaw<{ anio: number; monto: Prisma.Decimal; procesos: bigint }[]>`
        SELECT extract(year FROM coalesce(a.fecha, p.fecha_publicacion))::int AS anio, sum(a.monto) AS monto, count(DISTINCT p.id) AS procesos
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id WHERE ${activas} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ entidad: string; monto: Prisma.Decimal; procesos: bigint }[]>`
        SELECT p.comprador_nombre AS entidad, sum(a.monto) AS monto, count(DISTINCT p.id) AS procesos
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id WHERE ${activas} GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 8`,
      procesos(Prisma.sql`EXISTS (SELECT 1 FROM ocds_adjudicacion a WHERE a.proceso_id = p.id AND ${activas})`, Prisma.sql`p.fecha_publicacion DESC NULLS LAST`, 1),
    ]);
    return {
      id: proveedor.id, nombre: proveedor.nombre, nit: proveedor.nit, tipo: proveedor.tipo,
      totales: {
        monto: Number(totales.monto ?? 0), procesos: Number(totales.procesos), entidades: Number(totales.entidades),
        desde: totales.desde, hasta: totales.hasta, conIndicadores: Number(totales.con_indicadores),
      },
      porAnio: porAnio.map((x) => ({ anio: x.anio, monto: Number(x.monto), procesos: Number(x.procesos) })),
      entidades: entidades.map((x) => ({ entidad: x.entidad, monto: Number(x.monto), procesos: Number(x.procesos) })),
      procesos: recientes.procesos,
    };
  });

  /** CU-10 · tablero de banderas rojas (RF-RIE-01 a 04, RF-WEB-07). */
  app.get('/app/riesgos', async (request) => {
    const f = Filtros.parse(request.query);
    const where = condiciones(f, true);
    const sinIndicador = condiciones({ ...f, indicador: undefined });
    const [lista, conteo] = await Promise.all([
      procesos(where, Prisma.sql`p.puntaje_riesgo DESC, p.fecha_publicacion DESC NULLS LAST`, f.pagina),
      prisma.$queryRaw<{ codigo: string; n: bigint }[]>`
        SELECT i.codigo, count(*) AS n FROM indicador_riesgo i JOIN ocds_proceso p ON p.id = i.proceso_id WHERE ${sinIndicador} GROUP BY 1`,
    ]);
    const porCodigo = new Map(conteo.map((c) => [c.codigo, Number(c.n)]));
    return {
      aviso: AVISO_RIESGO,
      indicadores: INDICADORES.map((i) => ({ ...i, peso: PARAMETROS_RIESGO.pesos[i.codigo], activados: porCodigo.get(i.codigo) ?? 0 })),
      ...lista,
    };
  });

  /** CU-10 · ranking de entidades y proveedores por procesos con indicadores (RF-RIE-03). */
  app.get('/app/riesgos/ranking', async (request) => {
    const f = Filtros.parse(request.query);
    const where = condiciones({ ...f, indicador: undefined });
    const [entidades, proveedores] = await Promise.all([
      prisma.$queryRaw<{ nombre: string; procesos: bigint; con_indicadores: bigint }[]>`
        SELECT p.comprador_nombre AS nombre, count(*) AS procesos, count(*) FILTER (WHERE p.puntaje_riesgo > 0) AS con_indicadores
        FROM ocds_proceso p WHERE ${where} AND p.estado = 'Adjudicado'
        GROUP BY p.comprador_nombre HAVING count(*) FILTER (WHERE p.puntaje_riesgo > 0) > 0
        ORDER BY 3 DESC, 2 LIMIT 10`,
      prisma.$queryRaw<{ id: number; nombre: string; procesos: bigint; con_indicadores: bigint; monto: Prisma.Decimal | null }[]>`
        SELECT v.id, v.nombre, count(DISTINCT p.id) AS procesos, count(DISTINCT p.id) FILTER (WHERE p.puntaje_riesgo > 0) AS con_indicadores, sum(a.monto) AS monto
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id JOIN proveedor v ON v.id = a.proveedor_id
        WHERE ${where} AND p.estado = 'Adjudicado' AND a.estado = 'active'
        GROUP BY v.id, v.nombre HAVING count(DISTINCT p.id) FILTER (WHERE p.puntaje_riesgo > 0) > 0
        ORDER BY 4 DESC, 3 LIMIT 10`,
    ]);
    return {
      aviso: AVISO_RIESGO,
      entidades: entidades.map((e) => ({ nombre: e.nombre, procesos: Number(e.procesos), conIndicadores: Number(e.con_indicadores) })),
      proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre, procesos: Number(p.procesos), conIndicadores: Number(p.con_indicadores), monto: Number(p.monto ?? 0) })),
    };
  });

  /** CU-10 · un proceso con la evidencia de cada indicador. */
  app.get('/app/riesgos/procesos/:ocid', async (request, reply) => {
    const { ocid } = z.object({ ocid: z.string().regex(/^ocds-[\w-]+$/) }).parse(request.params);
    const p = await prisma.ocdsProceso.findUnique({
      where: { ocid },
      include: {
        indicadores: { orderBy: { codigo: 'asc' } },
        adjudicaciones: { include: { proveedor: { select: { id: true, nombre: true, nit: true } } }, orderBy: { fecha: 'asc' } },
      },
    });
    if (!p) return reply.code(404).send({ error: 'Proceso no encontrado' });
    const definiciones = new Map(INDICADORES.map((i) => [i.codigo, i]));
    return {
      aviso: AVISO_RIESGO,
      ocid: p.ocid, nog: p.nog, titulo: p.titulo, entidad: p.compradorNombre, modalidad: p.modalidad,
      categoria: p.categoria ? CATEGORIAS_OCDS[p.categoria] ?? p.categoria : null,
      fechaPublicacion: p.fechaPublicacion, inicioOfertas: p.inicioOfertas, finOfertas: p.finOfertas,
      numeroOfertas: p.numeroOfertas, estado: p.estado, puntajeRiesgo: p.puntajeRiesgo, urlGuatecompras: urlGuatecompras(p.nog),
      indicadores: p.indicadores.map((i) => ({
        codigo: i.codigo, nombre: definiciones.get(i.codigo as never)?.nombre ?? i.codigo,
        explicacion: definiciones.get(i.codigo as never)?.explicacion ?? '', evidencia: i.evidencia,
        peso: PARAMETROS_RIESGO.pesos[i.codigo as keyof typeof PARAMETROS_RIESGO.pesos] ?? 0,
      })),
      adjudicaciones: p.adjudicaciones.map((a) => ({
        proveedorId: a.proveedor.id, proveedor: a.proveedor.nombre, nit: a.proveedor.nit,
        monto: a.monto === null ? null : Number(a.monto), fecha: a.fecha, estado: a.estado,
      })),
    };
  });

  /**
   * RF-OCDS-03 · adjudicaciones anteriores para un concurso nuevo: de la misma entidad y de procesos
   * con título parecido (referencia de precios). Coincidencia por nombre de entidad y por trigramas del título.
   */
  app.get('/app/concursos/:nog/historial', async (request, reply) => {
    const { nog } = z.object({ nog: z.string().regex(/^\d{6,}$/) }).parse(request.params);
    const concurso = await prisma.concurso.findUnique({ where: { nog }, select: { titulo: true, entidad: { select: { nombre: true } } } });
    if (!concurso) return reply.code(404).send({ error: 'Concurso no encontrado' });
    const adjudicado = Prisma.sql`p.estado = 'Adjudicado' AND (p.nog IS NULL OR p.nog <> ${nog})`;
    // Las palabras más informativas del título: cada ILIKE usa el índice de trigramas
    const palabras = palabrasClave(concurso.titulo);
    const [entidad, similares] = await Promise.all([
      procesos(Prisma.sql`${adjudicado} AND p.comprador_nombre = ${concurso.entidad.nombre.toUpperCase()}`, Prisma.sql`p.fecha_publicacion DESC NULLS LAST`, 1),
      palabras.length
        ? prisma.$queryRaw<{ id: number }[]>`
            SELECT p.id FROM ocds_proceso p
            WHERE ${adjudicado} AND ${Prisma.join(palabras.map((w) => Prisma.sql`p.titulo ILIKE ${'%' + w + '%'}`), ' AND ')}
            ORDER BY similarity(p.titulo, ${concurso.titulo}) DESC LIMIT 8`
        : Promise.resolve([]),
    ]);
    const parecidos = similares.length
      ? await procesos(Prisma.sql`p.id IN (${Prisma.join(similares.map((s) => s.id))})`, Prisma.sql`p.fecha_publicacion DESC NULLS LAST`, 1)
      : { procesos: [] };
    return { entidad: entidad.procesos.slice(0, 8), entidadTotal: entidad.total, similares: parecidos.procesos };
  });
}
