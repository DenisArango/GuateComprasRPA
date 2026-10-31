import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { preseleccionar } from '../../domain/preseleccion.js';
import { EstadoSistema, EtapaCoincidencia, type Prisma } from '../../generated/prisma/client.js';

/** Fecha sin hora: acepta "2026-11-02" y "2026-11-02T00:00:00" (formato de System.Text.Json). */
const FechaSinHora = z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((s) => s.slice(0, 10));

/** Un concurso tal como lo envía VC.Captura (clase ConcursoBoletin del coded workflow). */
const ConcursoBoletin = z.object({
  nog: z.string().regex(/^\d{6,}$/),
  seccion: z.enum(['CONCURSO', 'PROYECTO_BASES']),
  fecha: FechaSinHora.nullable(),
  fechaTexto: z.string().nullable(),
  modalidad: z.string().min(1),
  tipo: z.string().nullable(),
  entidad: z.string().min(1),
  unidadCompradora: z.string().nullable(),
  descripcion: z.string().min(1),
  url: z.url(),
  categorias: z.array(z.string()),
});

const SolicitudBoletin = z.object({
  fechaPublicacion: FechaSinHora,
  concursos: z.array(ConcursoBoletin).max(10_000),
});

export type SolicitudBoletin = z.input<typeof SolicitudBoletin>;

/** Fecha local (para las reglas de dominio) y UTC (para columnas DATE). */
const local = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * POST /robot/boletin · VC.Captura envía el boletín del día; la API guarda los concursos nuevos,
 * preselecciona con los perfiles activos y devuelve solo los candidatos que aún no estaban
 * preseleccionados (así volver a enviar el mismo boletín no duplica elementos en la cola).
 */
export async function rutasBoletin(app: FastifyInstance) {
  app.post('/robot/boletin', async (request, reply) => {
    const datos = SolicitudBoletin.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Boletín inválido', detalle: z.treeifyError(datos.error) });

    const { fechaPublicacion, concursos: todos } = datos.data;
    const concursos = todos.filter((c) => c.seccion === 'CONCURSO');

    // Entidades
    const nombres = [...new Set(concursos.map((c) => c.entidad))];
    await prisma.entidad.createMany({ data: nombres.map((nombre) => ({ nombre })), skipDuplicates: true });
    const entidades = new Map(
      (await prisma.entidad.findMany({ where: { nombre: { in: nombres } }, select: { id: true, nombre: true } })).map((e) => [e.nombre, e.id]),
    );

    // Concursos nuevos (los existentes no se tocan: el boletín no cambia lo ya registrado)
    const existentes = new Map(
      (await prisma.concurso.findMany({ where: { nog: { in: concursos.map((c) => c.nog) } }, select: { nog: true, estadoSistema: true } })).map((c) => [c.nog, c.estadoSistema]),
    );
    const nuevos = concursos.filter((c) => !existentes.has(c.nog));
    await prisma.concurso.createMany({
      data: nuevos.map((c) => ({
        nog: c.nog,
        entidadId: entidades.get(c.entidad)!,
        titulo: c.descripcion,
        unidadCompradora: c.unidadCompradora,
        modalidad: c.modalidad,
        categorias: c.categorias,
        fechaPublicacion: utc(fechaPublicacion),
        fechaCierre: c.fecha ? utc(c.fecha) : null,
        url: c.url,
        origenBoletin: c as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

    // Preselección: solo concursos que todavía no entraron al flujo
    const pendientes = concursos.filter((c) => (existentes.get(c.nog) ?? null) === null);
    const perfiles = await prisma.perfilEmpresa.findMany({
      where: { activo: true },
      select: { id: true, categorias: true, palabrasClave: true, modalidades: true },
    });
    const candidatos = preseleccionar(
      pendientes.map((c) => ({ nog: c.nog, fechaCierre: c.fecha ? local(c.fecha) : null, modalidad: c.modalidad, categorias: c.categorias, descripcion: c.descripcion })),
      perfiles,
      new Date(),
      config.PRESELECCION_MAX_DIARIO,
    );

    const ids = new Map(
      (await prisma.concurso.findMany({ where: { nog: { in: candidatos.map((c) => c.nog) } }, select: { id: true, nog: true } })).map((c) => [c.nog, c.id]),
    );
    await prisma.$transaction([
      prisma.concurso.updateMany({
        where: { nog: { in: candidatos.map((c) => c.nog) }, estadoSistema: null },
        data: { estadoSistema: EstadoSistema.PRESELECCIONADO },
      }),
      ...candidatos.flatMap((c) =>
        c.resultados.map((r) =>
          prisma.coincidencia.upsert({
            where: { concursoId_perfilId_etapa: { concursoId: ids.get(c.nog)!, perfilId: r.perfilId, etapa: EtapaCoincidencia.PRELIMINAR } },
            create: { concursoId: ids.get(c.nog)!, perfilId: r.perfilId, etapa: EtapaCoincidencia.PRELIMINAR, puntaje: r.puntaje, detalle: r.detalle },
            update: { puntaje: r.puntaje, detalle: r.detalle, calculadoEn: new Date() },
          }),
        ),
      ),
    ]);

    request.log.info({ fechaPublicacion, recibidos: concursos.length, nuevos: nuevos.length, candidatos: candidatos.length }, 'boletín procesado');
    return {
      fechaPublicacion,
      recibidos: concursos.length,
      nuevos: nuevos.length,
      candidatos: candidatos.map((c) => ({ nog: c.nog, puntaje: c.puntaje, perfiles: c.resultados.map((r) => r.perfilId) })),
    };
  });
}
