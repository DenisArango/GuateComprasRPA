import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { NOMBRES_DOCUMENTOS } from '../../domain/ficha.js';
import { diasEntre, documentosPorVencer, oportunidadesNuevas, tocaRecordatorio, umbralDeEtapa } from '../../domain/notificaciones.js';
import { EstadoNotificacion, EstadoSeguimiento, EtapaCoincidencia, TipoNotificacion } from '../../generated/prisma/client.js';

const inicioDeHoy = () => { const h = new Date(); return new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())); };
const ACTIVOS = [EstadoSeguimiento.SIGUIENDO, EstadoSeguimiento.PARTICIPARE];
/** Máximo de oportunidades en un resumen; el resto se ve en el dashboard */
const MAX_OPORTUNIDADES = 15;

const nombreDocumento = (codigo: string) => NOMBRES_DOCUMENTOS[codigo as keyof typeof NOMBRES_DOCUMENTOS] ?? codigo;
const enlace = (nog: string) => `${config.WEB_URL}/concursos/${nog}`;

const concursoSelect = {
  id: true, nog: true, titulo: true, modalidad: true, fechaCierre: true, montoEstimado: true, url: true,
  entidad: { select: { nombre: true } },
} as const;

type ConcursoBase = { nog: string; titulo: string; modalidad: string; fechaCierre: Date | null; montoEstimado: unknown; url: string; entidad: { nombre: string } };

function concursoParaCorreo(c: ConcursoBase, hoy: Date) {
  return {
    nog: c.nog,
    titulo: c.titulo,
    entidad: c.entidad.nombre,
    modalidad: c.modalidad,
    fechaCierre: c.fechaCierre?.toISOString().slice(0, 10) ?? null,
    diasParaCierre: c.fechaCierre ? diasEntre(hoy, c.fechaCierre) : null,
    monto: c.montoEstimado === null ? null : Number(c.montoEstimado),
    enlace: enlace(c.nog),
    urlGuatecompras: c.url,
  };
}

const Registro = z.object({
  perfilId: z.number().int().positive().nullable(),
  tipo: z.enum(TipoNotificacion),
  canal: z.string().default('correo'),
  estado: z.enum(EstadoNotificacion),
  destinatarios: z.array(z.string()).min(1),
  asunto: z.string().min(1),
  nogs: z.array(z.string()).default([]),
  error: z.string().nullable().optional(),
});

export async function rutasNotificaciones(app: FastifyInstance) {
  /**
   * GET /robot/notificaciones/resumen · contenido del resumen diario por perfil (RF-NOT-01, 04):
   * oportunidades nuevas, recordatorios de cierre y documentos por vencer.
   * Solo incluye perfiles con destinatarios y con algo que contar.
   */
  app.get('/robot/notificaciones/resumen', async () => {
    const hoy = inicioDeHoy();
    const perfiles = await prisma.perfilEmpresa.findMany({
      where: { activo: true },
      select: {
        id: true, nombre: true, umbralCompatibilidad: true, telegramChats: true,
        usuarios: { where: { activo: true }, select: { correo: true, nombre: true } },
        documentos: { select: { documentoNormalizado: true, venceEn: true } },
      },
      orderBy: { id: 'asc' },
    });

    const resultado = [];
    for (const perfil of perfiles) {
      if (!perfil.usuarios.length && !perfil.telegramChats.length) continue;

      const [coincidencias, seguidos] = await Promise.all([
        prisma.coincidencia.findMany({
          where: { perfilId: perfil.id, concurso: { OR: [{ fechaCierre: null }, { fechaCierre: { gte: hoy } }] } },
          select: {
            concursoId: true, etapa: true, puntaje: true, notificado: true, faltantes: true,
            concurso: { select: { ...concursoSelect, seguimientos: { where: { perfilId: perfil.id }, select: { estado: true } } } },
          },
        }),
        prisma.seguimiento.findMany({
          where: { perfilId: perfil.id, estado: { in: ACTIVOS }, concurso: { fechaCierre: { gte: hoy } } },
          select: { estado: true, concurso: { select: concursoSelect } },
        }),
      ]);

      const nuevas = oportunidadesNuevas(
        coincidencias.map((c) => ({
          ...c,
          fechaCierre: c.concurso.fechaCierre,
          descartado: c.concurso.seguimientos.some((s) => s.estado === EstadoSeguimiento.DESCARTADO),
        })),
        perfil.umbralCompatibilidad,
        hoy,
      );
      const oportunidades = nuevas.slice(0, MAX_OPORTUNIDADES).map((c) => ({
        ...concursoParaCorreo(c.concurso, hoy),
        puntaje: c.puntaje,
        etapa: c.etapa,
        faltantes: c.etapa === EtapaCoincidencia.COMPLETA ? c.faltantes.map(nombreDocumento) : null,
      }));

      const recordatorios = seguidos
        .map((s) => ({ s, dias: tocaRecordatorio(s.concurso.fechaCierre, hoy, config.RECORDATORIO_DIAS) }))
        .filter((x) => x.dias !== null)
        .map(({ s }) => ({ ...concursoParaCorreo(s.concurso, hoy), seguimiento: s.estado }));

      const documentos = documentosPorVencer(perfil.documentos, hoy, config.AVISO_DOCUMENTOS_DIAS).map((d) => ({
        documento: nombreDocumento(d.documentoNormalizado),
        venceEn: d.venceEn!.toISOString().slice(0, 10),
        dias: d.dias,
      }));

      if (!oportunidades.length && !recordatorios.length && !documentos.length) continue;
      resultado.push({
        perfilId: perfil.id,
        empresa: perfil.nombre,
        destinatarios: perfil.usuarios,
        telegram: perfil.telegramChats,
        oportunidades,
        oportunidadesTotal: nuevas.length,
        recordatorios,
        documentosPorVencer: documentos,
      });
    }
    return { fecha: hoy.toISOString().slice(0, 10), webUrl: config.WEB_URL, perfiles: resultado };
  });

  /**
   * GET /robot/notificaciones/aviso?nog=&tipo= · avisos inmediatos desde la cola VC_Notificaciones.
   * FICHA: la ficha completa a los perfiles compatibles (con faltantes).
   * CAMBIO: los cambios recientes a quienes siguen el concurso (RF-NOT-03).
   */
  app.get('/robot/notificaciones/aviso', async (request, reply) => {
    const q = z.object({ nog: z.string().regex(/^\d{6,}$/), tipo: z.enum(['FICHA', 'CAMBIO']) }).parse(request.query);
    const hoy = inicioDeHoy();
    const concurso = await prisma.concurso.findUnique({
      where: { nog: q.nog },
      select: {
        ...concursoSelect,
        ficha: { select: { resumen: true, validadaPor: true, requisitos: { where: { posibleRestrictivo: true }, select: { descripcion: true, motivoRestrictivo: true } } } },
        cambios: { where: { detectadoEn: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { detectadoEn: 'desc' }, select: { tipo: true, resumenIa: true, detectadoEn: true } },
      },
    });
    if (!concurso) return reply.code(404).send({ error: 'Concurso no encontrado' });

    const base = { ...concursoParaCorreo(concurso, hoy), resumen: concurso.ficha?.resumen ?? null, validadaPor: concurso.ficha?.validadaPor ?? null };
    const usuarios = { where: { activo: true }, select: { correo: true, nombre: true } } as const;

    if (q.tipo === 'FICHA') {
      const coincidencias = await prisma.coincidencia.findMany({
        where: { concursoId: concurso.id, etapa: EtapaCoincidencia.COMPLETA, notificado: false, perfil: { activo: true } },
        select: { puntaje: true, faltantes: true, perfil: { select: { id: true, nombre: true, umbralCompatibilidad: true, telegramChats: true, usuarios, seguimientos: { where: { concursoId: concurso.id }, select: { estado: true } } } } },
      });
      const perfiles = coincidencias
        .filter((c) => c.puntaje >= umbralDeEtapa('COMPLETA', c.perfil.umbralCompatibilidad))
        .filter((c) => !c.perfil.seguimientos.some((s) => s.estado === EstadoSeguimiento.DESCARTADO))
        .filter((c) => c.perfil.usuarios.length || c.perfil.telegramChats.length)
        .map((c) => ({ perfilId: c.perfil.id, empresa: c.perfil.nombre, destinatarios: c.perfil.usuarios, telegram: c.perfil.telegramChats, puntaje: c.puntaje, faltantes: c.faltantes.map(nombreDocumento) }));
      const vigente = concurso.fechaCierre === null || diasEntre(hoy, concurso.fechaCierre) >= 0;
      return {
        tipo: q.tipo, concurso: { ...base, restrictivos: concurso.ficha?.requisitos ?? [] },
        perfiles: vigente ? perfiles : [],
      };
    }

    const seguidores = await prisma.seguimiento.findMany({
      where: { concursoId: concurso.id, estado: { in: ACTIVOS }, perfil: { activo: true } },
      select: { estado: true, perfil: { select: { id: true, nombre: true, telegramChats: true, usuarios } } },
    });
    return {
      tipo: q.tipo,
      concurso: { ...base, cambios: concurso.cambios.map((c) => ({ tipo: c.tipo, resumen: c.resumenIa, detectadoEn: c.detectadoEn.toISOString() })) },
      perfiles: seguidores
        .filter((s) => s.perfil.usuarios.length || s.perfil.telegramChats.length)
        .map((s) => ({ perfilId: s.perfil.id, empresa: s.perfil.nombre, destinatarios: s.perfil.usuarios, telegram: s.perfil.telegramChats, seguimiento: s.estado })),
    };
  });

  /**
   * POST /robot/notificaciones · VC.Notificador registra cada envío. Si fue enviado, las
   * oportunidades incluidas quedan como notificadas y no se repiten al día siguiente.
   */
  app.post('/robot/notificaciones', async (request, reply) => {
    const datos = Registro.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Registro inválido', detalle: z.treeifyError(datos.error) });
    const r = datos.data;

    const notificacion = await prisma.$transaction(async (tx) => {
      const creada = await tx.notificacion.create({ data: { ...r, error: r.error ?? null } });
      if (r.estado === EstadoNotificacion.ENVIADO && r.perfilId && r.nogs.length && r.tipo !== TipoNotificacion.CAMBIO) {
        await tx.coincidencia.updateMany({
          where: { perfilId: r.perfilId, concurso: { nog: { in: r.nogs } }, ...(r.tipo === TipoNotificacion.FICHA ? { etapa: EtapaCoincidencia.COMPLETA } : {}) },
          data: { notificado: true },
        });
      }
      return creada;
    });
    return reply.code(201).send({ id: notificacion.id });
  });
}
