import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { documentosVigentes } from '../../domain/compatibilidad.js';
import { PESOS_PRESELECCION } from '../../domain/preseleccion.js';
import { EstadoSeguimiento, EstadoSistema, EtapaCoincidencia } from '../../generated/prisma/client.js';
import { iniciarProceso, orchestratorActivo } from '../../servicios/orchestrator.js';
import { exigirSesion, puedeVerPerfil } from './autenticacion.js';

const ConPerfil = z.object({ perfilId: z.coerce.number().int().positive() });
const Nog = z.object({ nog: z.string().regex(/^\d{6,}$/) });

const inicioDeHoy = () => { const h = new Date(); return new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())); };
const dias = (n: number) => n * 86_400_000;

/** Umbral que se aplica a cada etapa: el del perfil para la completa, el de preselección para la preliminar. */
function umbral(etapa: EtapaCoincidencia, umbralPerfil: number) {
  return etapa === EtapaCoincidencia.COMPLETA ? umbralPerfil : PESOS_PRESELECCION.umbral;
}

export async function rutasConcursosApp(app: FastifyInstance) {
  app.addHook('onRequest', exigirSesion);
  app.addHook('preHandler', async (request, reply) => {
    const perfilId = Number((request.query as { perfilId?: string })?.perfilId ?? (request.body as { perfilId?: number })?.perfilId);
    if (perfilId && !(await puedeVerPerfil(request.user, perfilId))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
  });

  /** Resumen del panel: cifras reales del sistema para un perfil. */
  app.get('/app/panel', async (request) => {
    const { perfilId } = ConPerfil.parse(request.query);
    const perfil = await prisma.perfilEmpresa.findUniqueOrThrow({ where: { id: perfilId }, select: { umbralCompatibilidad: true } });
    const hoy = inicioDeHoy();

    const coincidencias = await prisma.coincidencia.findMany({
      where: { perfilId, concurso: { OR: [{ fechaCierre: null }, { fechaCierre: { gte: hoy } }] } },
      select: { concursoId: true, etapa: true, puntaje: true, concurso: { select: { fechaCierre: true } } },
    });
    const porConcurso = new Map<number, (typeof coincidencias)[number]>();
    for (const c of coincidencias) {
      const actual = porConcurso.get(c.concursoId);
      if (!actual || c.etapa === EtapaCoincidencia.COMPLETA) porConcurso.set(c.concursoId, c);
    }
    const oportunidades = [...porConcurso.values()].filter((c) => c.puntaje >= umbral(c.etapa, perfil.umbralCompatibilidad));
    const enSieteDias = new Date(hoy.getTime() + dias(7));

    const ultimo = await prisma.concurso.aggregate({ _max: { fechaPublicacion: true } });
    const fechaBoletin = ultimo._max.fechaPublicacion;
    const delBoletin = fechaBoletin ? { fechaPublicacion: fechaBoletin } : { id: -1 };
    const [recibidos, preseleccionados, capturados, analizados] = await Promise.all([
      prisma.concurso.count({ where: delBoletin }),
      prisma.concurso.count({ where: { ...delBoletin, coincidencias: { some: { perfilId, etapa: EtapaCoincidencia.PRELIMINAR } } } }),
      prisma.concurso.count({ where: { ...delBoletin, documentos: { some: {} } } }),
      prisma.concurso.count({ where: { ...delBoletin, ficha: { isNot: null } } }),
    ]);
    const [enRevision, gasto, siguiendo] = await Promise.all([
      prisma.concurso.count({ where: { estadoSistema: EstadoSistema.REVISION_MANUAL } }),
      prisma.usoIa.aggregate({ _sum: { costoUsd: true }, _count: true, where: { creadoEn: { gte: new Date(Date.now() - dias(30)) } } }),
      prisma.seguimiento.count({ where: { perfilId, estado: { in: [EstadoSeguimiento.SIGUIENDO, EstadoSeguimiento.PARTICIPARE] } } }),
    ]);

    return {
      oportunidades: oportunidades.length,
      cierranEstaSemana: oportunidades.filter((o) => o.concurso.fechaCierre && o.concurso.fechaCierre <= enSieteDias).length,
      siguiendo,
      enRevision,
      ia: { gasto30DiasUsd: Number(gasto._sum.costoUsd ?? 0), llamadas30Dias: gasto._count, presupuestoDiarioUsd: config.IA_PRESUPUESTO_DIARIO_USD },
      embudo: { fechaBoletin, recibidos, preseleccionados, capturados, analizados },
    };
  });

  /** Oportunidades del perfil (RF-WEB-02): mejor puntaje disponible, ordenadas por puntaje y cierre. */
  app.get('/app/oportunidades', async (request) => {
    const q = ConPerfil.extend({
      buscar: z.string().trim().optional(),
      vista: z.enum(['abiertas', 'siguiendo', 'todas']).default('abiertas'),
    }).parse(request.query);
    const perfil = await prisma.perfilEmpresa.findUniqueOrThrow({ where: { id: q.perfilId }, select: { umbralCompatibilidad: true } });
    const hoy = inicioDeHoy();

    const filas = await prisma.coincidencia.findMany({
      where: {
        perfilId: q.perfilId,
        concurso: {
          ...(q.vista === 'abiertas' && { OR: [{ fechaCierre: null }, { fechaCierre: { gte: hoy } }] }),
          ...(q.vista === 'siguiendo' && { seguimientos: { some: { perfilId: q.perfilId, estado: { not: EstadoSeguimiento.DESCARTADO } } } }),
          ...(q.buscar && {
            AND: [{ OR: [
              { titulo: { contains: q.buscar, mode: 'insensitive' } },
              { nog: { contains: q.buscar } },
              { entidad: { nombre: { contains: q.buscar, mode: 'insensitive' } } },
            ] }],
          }),
        },
      },
      select: {
        etapa: true, puntaje: true, faltantes: true, calificacionUsuario: true,
        concurso: {
          select: {
            id: true, nog: true, titulo: true, modalidad: true, fechaCierre: true, montoEstimado: true, estadoSistema: true,
            entidad: { select: { nombre: true } },
            ficha: { select: { monto: true, validadaPor: true, confianza: true } },
            seguimientos: { where: { perfilId: q.perfilId }, select: { estado: true } },
          },
        },
      },
    });

    const porConcurso = new Map<number, (typeof filas)[number]>();
    for (const f of filas) {
      const actual = porConcurso.get(f.concurso.id);
      if (!actual || f.etapa === EtapaCoincidencia.COMPLETA) porConcurso.set(f.concurso.id, f);
    }

    return [...porConcurso.values()]
      .filter((f) => q.vista !== 'abiertas' || f.puntaje >= umbral(f.etapa, perfil.umbralCompatibilidad))
      .filter((f) => f.concurso.seguimientos[0]?.estado !== EstadoSeguimiento.DESCARTADO || q.vista === 'todas')
      .map((f) => ({
        nog: f.concurso.nog,
        titulo: f.concurso.titulo,
        entidad: f.concurso.entidad.nombre,
        modalidad: f.concurso.modalidad,
        fechaCierre: f.concurso.fechaCierre,
        monto: f.concurso.ficha?.monto ?? f.concurso.montoEstimado,
        estado: f.concurso.estadoSistema,
        puntaje: f.puntaje,
        etapa: f.etapa,
        faltantes: f.etapa === EtapaCoincidencia.COMPLETA ? f.faltantes : null,
        validadaPor: f.concurso.ficha?.validadaPor ?? null,
        seguimiento: f.concurso.seguimientos[0]?.estado ?? null,
        calificacion: f.calificacionUsuario,
      }))
      .sort((a, b) => b.puntaje - a.puntaje || (a.fechaCierre?.getTime() ?? Infinity) - (b.fechaCierre?.getTime() ?? Infinity))
      .slice(0, 300);
  });

  /** Ficha completa de un concurso (RF-WEB-03, CU-07). */
  app.get('/app/concursos/:nog', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const { perfilId } = ConPerfil.parse(request.query);
    const concurso = await prisma.concurso.findUnique({
      where: { nog },
      include: {
        entidad: true,
        ficha: { include: { requisitos: true, criterios: true } },
        documentos: { select: { id: true, nombreOriginal: true, tipo: true, paginas: true, requiereOcr: true, tamanoBytes: true }, orderBy: { id: 'asc' } },
        cambios: { orderBy: { detectadoEn: 'desc' } },
        coincidencias: { where: { perfilId } },
        seguimientos: { where: { perfilId } },
        expedientes: { where: { perfilId }, orderBy: { generadoEn: 'desc' }, take: 1 },
      },
    });
    if (!concurso) return reply.code(404).send({ error: `Concurso ${nog} no encontrado` });

    const perfil = await prisma.perfilEmpresa.findUniqueOrThrow({ where: { id: perfilId }, include: { documentos: true } });
    const vigentes = documentosVigentes(
      { id: perfil.id, categorias: [], palabrasClave: [], departamentos: [], montoMin: null, montoMax: null, documentos: perfil.documentos.map((d) => ({ documento: d.documentoNormalizado, venceEn: d.venceEn })) },
      concurso.fechaCierre && concurso.fechaCierre > new Date() ? concurso.fechaCierre : new Date(),
    );
    const completa = concurso.coincidencias.find((c) => c.etapa === EtapaCoincidencia.COMPLETA);
    const preliminar = concurso.coincidencias.find((c) => c.etapa === EtapaCoincidencia.PRELIMINAR);

    return {
      nog: concurso.nog,
      titulo: concurso.titulo,
      entidad: concurso.entidad.nombre,
      unidadCompradora: concurso.unidadCompradora,
      modalidad: concurso.modalidad,
      categorias: concurso.categorias,
      fechaPublicacion: concurso.fechaPublicacion,
      fechaCierre: concurso.fechaCierre,
      montoPortal: concurso.montoEstimado,
      estado: concurso.estadoSistema,
      estadoGc: concurso.estadoGc,
      url: concurso.url,
      ficha: concurso.ficha && {
        resumen: concurso.ficha.resumen,
        objeto: concurso.ficha.objeto,
        monto: concurso.ficha.monto,
        plazoEntrega: concurso.ficha.plazoEntrega,
        lugarEntrega: concurso.ficha.lugarEntrega,
        fechaLimiteOfertas: concurso.ficha.fechaLimiteOfertas,
        garantias: concurso.ficha.garantias,
        confianza: Number(concurso.ficha.confianza),
        validadaPor: concurso.ficha.validadaPor,
        modeloIa: concurso.ficha.modeloIa,
        costoUsd: Number(concurso.ficha.costoUsd),
        generadoEn: concurso.ficha.generadoEn,
        requisitos: concurso.ficha.requisitos.map((r) => ({
          tipo: r.tipo, descripcion: r.descripcion, documento: r.documentoNormalizado, obligatorio: r.obligatorio,
          referencia: r.referencia, posibleRestrictivo: r.posibleRestrictivo, motivoRestrictivo: r.motivoRestrictivo,
          cumple: r.documentoNormalizado && r.documentoNormalizado !== 'OTRO' ? vigentes.has(r.documentoNormalizado) : null,
        })),
        criterios: concurso.ficha.criterios.map((c) => ({ criterio: c.criterio, ponderacion: c.ponderacion === null ? null : Number(c.ponderacion) })),
      },
      compatibilidad: (completa ?? preliminar) && {
        etapa: (completa ?? preliminar)!.etapa,
        puntaje: (completa ?? preliminar)!.puntaje,
        detalle: (completa ?? preliminar)!.detalle,
        faltantes: completa?.faltantes ?? [],
        calificacion: (completa ?? preliminar)!.calificacionUsuario,
      },
      documentos: concurso.documentos,
      cambios: concurso.cambios.map((c) => ({ tipo: c.tipo, antes: c.antes, despues: c.despues, resumenIa: c.resumenIa, detectadoEn: c.detectadoEn })),
      seguimiento: concurso.seguimientos[0]?.estado ?? null,
      expediente: concurso.expedientes[0]
        ? { ruta: concurso.expedientes[0].ruta, faltantes: concurso.expedientes[0].faltantes, generadoEn: concurso.expedientes[0].generadoEn }
        : null,
    };
  });

  /** CU-08: seguir, participar o descartar (estado null = quitar). */
  app.put('/app/concursos/:nog/seguimiento', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const { perfilId, estado } = z.object({ perfilId: z.number().int().positive(), estado: z.enum(EstadoSeguimiento).nullable() }).parse(request.body);
    if (!(await puedeVerPerfil(request.user, perfilId))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
    const concurso = await prisma.concurso.findUnique({ where: { nog }, select: { id: true, estadoSistema: true, ficha: { select: { id: true } } } });
    if (!concurso) return reply.code(404).send({ error: `Concurso ${nog} no encontrado` });
    if (estado === null) {
      await prisma.seguimiento.deleteMany({ where: { perfilId, concursoId: concurso.id } });
    } else {
      await prisma.seguimiento.upsert({
        where: { perfilId_concursoId: { perfilId, concursoId: concurso.id } },
        create: { perfilId, concursoId: concurso.id, estado },
        update: { estado },
      });
    }

    // "Participaré" arma el expediente sin que la persona abra UiPath Assistant (CU-16 automático)
    let expediente: 'INICIADO' | 'SIN_FICHA' | 'NO_DISPONIBLE' | null = null;
    if (estado === EstadoSeguimiento.PARTICIPARE) {
      if (!concurso.ficha || concurso.estadoSistema === EstadoSistema.REVISION_MANUAL) expediente = 'SIN_FICHA';
      else if (!orchestratorActivo()) expediente = 'NO_DISPONIBLE';
      else {
        try {
          await iniciarProceso('VC.Expediente', { in_Nog: nog, in_PerfilId: perfilId, in_Desatendido: true });
          expediente = 'INICIADO';
        } catch (e) {
          request.log.warn(e, 'No se pudo iniciar VC.Expediente');
          expediente = 'NO_DISPONIBLE';
        }
      }
    }
    return { nog, estado, expediente };
  });

  /** CU-14: calificar la alerta (alimenta la métrica de precisión, OE3). */
  app.put('/app/concursos/:nog/calificacion', async (request) => {
    const { nog } = Nog.parse(request.params);
    const { perfilId, relevante } = z.object({ perfilId: z.number().int().positive(), relevante: z.boolean().nullable() }).parse(request.body);
    const { count } = await prisma.coincidencia.updateMany({
      where: { perfilId, concurso: { nog } },
      data: { calificacionUsuario: relevante === null ? null : relevante ? 'relevante' : 'no_relevante' },
    });
    return { nog, calificadas: count };
  });

  /** Descarga de un documento del concurso para el usuario. */
  app.get('/app/documentos/:id/archivo', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const documento = await prisma.documento.findUnique({ where: { id } });
    if (!documento) return reply.code(404).send({ error: 'Documento no encontrado' });
    return reply
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(documento.nombreOriginal)}`)
      .type('application/octet-stream')
      .send(createReadStream(path.join(config.STORAGE_DIR, documento.rutaAlmacen)));
  });
}
