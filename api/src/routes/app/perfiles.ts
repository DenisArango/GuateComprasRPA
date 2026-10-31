import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { DOCUMENTOS_NORMALIZADOS, NOMBRES_DOCUMENTOS } from '../../domain/ficha.js';
import { recalcularCompatibilidad } from '../../servicios/compatibilidad.js';
import { exigirSesion, puedeVerPerfil } from './autenticacion.js';

const Id = z.object({ id: z.coerce.number().int().positive() });

const Perfil = z.object({
  nombre: z.string().trim().min(2),
  nit: z.string().trim().nullable(),
  categorias: z.array(z.string()),
  palabrasClave: z.array(z.string().trim().min(2)).max(60),
  modalidades: z.array(z.string()),
  departamentos: z.array(z.string()),
  montoMin: z.number().nonnegative().nullable(),
  montoMax: z.number().nonnegative().nullable(),
  umbralCompatibilidad: z.number().int().min(0).max(100),
  documentos: z.array(z.object({
    documento: z.enum(DOCUMENTOS_NORMALIZADOS),
    venceEn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })),
}).refine((p) => p.montoMin === null || p.montoMax === null || p.montoMin <= p.montoMax, { message: 'El monto mínimo no puede ser mayor que el máximo', path: ['montoMin'] });

const DEPARTAMENTOS = ['Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Guatemala', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa'];

export async function rutasPerfilesApp(app: FastifyInstance) {
  app.addHook('onRequest', exigirSesion);

  app.get('/app/catalogos', async () => {
    const categorias = await prisma.$queryRaw<{ categoria: string }[]>`SELECT DISTINCT unnest(categorias) AS categoria FROM concurso ORDER BY 1`;
    return {
      categorias: categorias.map((c) => c.categoria),
      documentos: DOCUMENTOS_NORMALIZADOS.filter((d) => d !== 'OTRO').map((codigo) => ({ codigo, nombre: NOMBRES_DOCUMENTOS[codigo] })),
      modalidades: ['Cotización', 'Licitación', 'Compra Directa'],
      departamentos: DEPARTAMENTOS,
    };
  });

  /** Perfiles que administra el usuario (todos, si es ADMIN). */
  app.get('/app/perfiles', async (request) =>
    prisma.perfilEmpresa.findMany({
      where: request.user.rol === 'ADMIN' ? {} : { usuarios: { some: { id: request.user.id } } },
      select: { id: true, nombre: true, activo: true },
      orderBy: { nombre: 'asc' },
    }));

  app.get('/app/perfiles/:id', async (request, reply) => {
    const { id } = Id.parse(request.params);
    if (!(await puedeVerPerfil(request.user, id))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
    const p = await prisma.perfilEmpresa.findUniqueOrThrow({ where: { id }, include: { documentos: { orderBy: { documentoNormalizado: 'asc' } } } });
    return {
      id: p.id, nombre: p.nombre, nit: p.nit, categorias: p.categorias, palabrasClave: p.palabrasClave, modalidades: p.modalidades,
      departamentos: p.departamentos, montoMin: p.montoMin === null ? null : Number(p.montoMin), montoMax: p.montoMax === null ? null : Number(p.montoMax),
      umbralCompatibilidad: p.umbralCompatibilidad,
      documentos: p.documentos.map((d) => ({ documento: d.documentoNormalizado, venceEn: d.venceEn?.toISOString().slice(0, 10) ?? null })),
    };
  });

  /** CU-06: guarda el perfil y recalcula la compatibilidad de los concursos con ficha. */
  app.put('/app/perfiles/:id', async (request, reply) => {
    const { id } = Id.parse(request.params);
    if (!(await puedeVerPerfil(request.user, id))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
    const datos = Perfil.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Perfil inválido', detalle: z.treeifyError(datos.error) });
    const { documentos, ...perfil } = datos.data;

    await prisma.$transaction([
      prisma.perfilEmpresa.update({ where: { id }, data: perfil }),
      prisma.documentoEmpresa.deleteMany({ where: { perfilId: id } }),
      prisma.documentoEmpresa.createMany({
        data: documentos.map((d) => ({ perfilId: id, documentoNormalizado: d.documento, venceEn: d.venceEn ? new Date(`${d.venceEn}T00:00:00Z`) : null })),
      }),
    ]);
    const recalculadas = await recalcularCompatibilidad({ perfilIds: [id] });
    return { id, recalculadas };
  });
}
