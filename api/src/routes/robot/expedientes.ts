import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { checklist, documentosACopiar, faltantesDelChecklist } from '../../domain/expediente.js';
import { NOMBRES_DOCUMENTOS } from '../../domain/ficha.js';
import { EstadoSistema } from '../../generated/prisma/client.js';

const Nog = z.object({ nog: z.string().regex(/^\d{6,}$/) });
const Consulta = z.object({ perfilId: z.coerce.number().int().positive().optional() });

const Registro = z.object({
  nog: z.string().regex(/^\d{6,}$/),
  perfilId: z.number().int().positive(),
  ruta: z.string().min(1),
  faltantes: z.array(z.string()).default([]),
  duracionSeg: z.number().int().nonnegative(),
});

/** Rutas de VC.Expediente, robot atendido (CU-16, docs/08-diseno-del-bot.md 8.6). */
export async function rutasExpedientes(app: FastifyInstance) {
  /**
   * GET /robot/expedientes/:nog?perfilId= · todo lo que el robot necesita para armar la carpeta:
   * concurso, ficha, empresa, documentos del concurso por descargar y checklist de requisitos.
   * Sin perfilId se usa el único perfil activo.
   */
  app.get('/robot/expedientes/:nog', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const { perfilId } = Consulta.parse(request.query);

    const concurso = await prisma.concurso.findUnique({
      where: { nog },
      include: {
        entidad: { select: { nombre: true } },
        ficha: { include: { requisitos: { orderBy: { id: 'asc' } }, criterios: { orderBy: { id: 'asc' } } } },
        documentos: { select: { id: true, nombreOriginal: true, tipo: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!concurso) return reply.code(404).send({ error: `El concurso ${nog} no está registrado` });
    if (!concurso.ficha) return reply.code(409).send({ error: `El concurso ${nog} todavía no tiene ficha` });
    if (concurso.estadoSistema === EstadoSistema.REVISION_MANUAL)
      return reply.code(409).send({ error: `La ficha del concurso ${nog} está pendiente de validación en Action Center` });

    const perfiles = await prisma.perfilEmpresa.findMany({
      where: perfilId ? { id: perfilId } : { activo: true },
      include: { documentos: true },
    });
    if (perfiles.length === 0) return reply.code(404).send({ error: perfilId ? `No existe el perfil ${perfilId}` : 'No hay perfiles activos' });
    if (perfiles.length > 1)
      return reply.code(400).send({ error: 'Hay varios perfiles activos: indique perfilId', perfiles: perfiles.map((p) => ({ id: p.id, nombre: p.nombre })) });
    const perfil = perfiles[0]!;

    // Los documentos deben estar vigentes hasta el cierre (RN-09); si ya cerró, a hoy
    const hoy = new Date();
    const fechaReferencia = concurso.fechaCierre && concurso.fechaCierre > hoy ? concurso.fechaCierre : hoy;
    const filas = checklist(
      concurso.ficha.requisitos.map((r) => ({
        tipo: r.tipo, descripcion: r.descripcion, documento: r.documentoNormalizado, obligatorio: r.obligatorio, referencia: r.referencia,
      })),
      perfil.documentos.map((d) => ({ documento: d.documentoNormalizado, venceEn: d.venceEn })),
      fechaReferencia,
    );

    const ficha = concurso.ficha;
    return {
      concurso: {
        nog: concurso.nog,
        titulo: concurso.titulo,
        entidad: concurso.entidad.nombre,
        unidadCompradora: concurso.unidadCompradora,
        modalidad: concurso.modalidad,
        fechaCierre: concurso.fechaCierre?.toISOString().slice(0, 10) ?? null,
        url: concurso.url,
      },
      ficha: {
        resumen: ficha.resumen,
        objeto: ficha.objeto,
        montoEstimado: ficha.monto === null ? null : Number(ficha.monto),
        plazoEntrega: ficha.plazoEntrega,
        lugarEntrega: ficha.lugarEntrega,
        fechaLimiteOfertas: ficha.fechaLimiteOfertas?.toISOString() ?? null,
        garantias: ficha.garantias,
        criterios: ficha.criterios.map((c) => ({ criterio: c.criterio, ponderacion: c.ponderacion === null ? null : Number(c.ponderacion) })),
        validadaPor: ficha.validadaPor,
      },
      perfil: { id: perfil.id, nombre: perfil.nombre, nit: perfil.nit },
      documentosConcurso: concurso.documentos.map((d) => ({ id: d.id, nombre: d.nombreOriginal, tipo: d.tipo })),
      checklist: filas,
      documentosACopiar: documentosACopiar(filas).map((codigo) => ({ codigo, nombre: NOMBRES_DOCUMENTOS[codigo as keyof typeof NOMBRES_DOCUMENTOS] ?? codigo })),
      faltantes: faltantesDelChecklist(filas),
      fechaReferencia: fechaReferencia.toISOString().slice(0, 10),
    };
  });

  /** POST /robot/expedientes · registra el expediente armado (ruta, faltantes y duración para la métrica de OE7). */
  app.post('/robot/expedientes', async (request, reply) => {
    const datos = Registro.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Registro inválido', detalle: z.treeifyError(datos.error) });
    const { nog, perfilId, ruta, faltantes, duracionSeg } = datos.data;
    const concurso = await prisma.concurso.findUnique({ where: { nog }, select: { id: true } });
    if (!concurso) return reply.code(404).send({ error: `El concurso ${nog} no está registrado` });
    const expediente = await prisma.expediente.create({ data: { perfilId, concursoId: concurso.id, ruta, faltantes, duracionSeg } });
    return reply.code(201).send({ id: expediente.id });
  });
}
