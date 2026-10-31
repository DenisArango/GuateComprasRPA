import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { sincronizarEjecuciones, tasaDeExito } from '../../servicios/ejecuciones.js';
import { agregarElementoCola, iniciarProceso, orchestratorActivo } from '../../servicios/orchestrator.js';
import { exigirSesion } from './autenticacion.js';

/** Procesos que el administrador puede relanzar desde el dashboard (los de segundo plano y VC.Concurso). */
export const PROCESOS_RELANZABLES = ['VC.Captura', 'VC.Concurso', 'VC.Analisis', 'VC.Analisis.RecogerRevisiones', 'VC.Notificador', 'VC.Datos'] as const;

async function exigirAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.rol !== 'ADMIN') return reply.code(403).send({ error: 'Solo el administrador' });
}

const Consulta = z.object({ dias: z.coerce.number().int().min(1).max(90).default(7), proceso: z.string().optional() });
const Manual = z.object({ nog: z.string().trim().regex(/^\d{6,12}$/, 'El NOG tiene solo números (6 a 12 dígitos)') });

/** CU-12 (supervisar ejecuciones) y CU-13 (capturar un NOG a mano). */
export async function rutasEjecucionesApp(app: FastifyInstance) {
  app.addHook('onRequest', exigirSesion);

  /** Bitácora: sincroniza con Orchestrator y devuelve las ejecuciones del periodo con su tasa de éxito. */
  app.get('/app/ejecuciones', { onRequest: exigirAdmin }, async (request) => {
    const { dias, proceso } = Consulta.parse(request.query);
    let error: string | null = null;
    if (orchestratorActivo()) {
      try { await sincronizarEjecuciones(); } catch (e) { error = (e as Error).message; request.log.warn(e, 'Orchestrator'); }
    } else error = 'Orchestrator no está configurado (UIPATH_* en infra/.env)';
    const desde = new Date(Date.now() - dias * 86_400_000);
    const ejecuciones = await prisma.ejecucionRobot.findMany({
      where: { inicio: { gte: desde }, ...(proceso && { proceso }) },
      orderBy: { inicio: 'desc' },
      take: 300,
    });
    return {
      error,
      resumen: tasaDeExito(ejecuciones),
      relanzables: PROCESOS_RELANZABLES,
      ejecuciones: ejecuciones.map((e) => ({
        id: e.id, proceso: e.proceso, estado: e.estado, inicio: e.inicio, fin: e.fin,
        duracionSeg: e.fin ? Math.round((e.fin.getTime() - e.inicio.getTime()) / 1000) : null,
        detalle: e.detalle,
      })),
    };
  });

  /** Relanza un proceso en el robot desatendido. */
  app.post('/app/ejecuciones', { onRequest: exigirAdmin }, async (request, reply) => {
    const { proceso } = z.object({ proceso: z.enum(PROCESOS_RELANZABLES) }).parse(request.body);
    if (!orchestratorActivo()) return reply.code(409).send({ error: 'Orchestrator no está configurado' });
    const trabajo = await iniciarProceso(proceso);
    return reply.code(201).send({ id: trabajo.Id, estado: trabajo.State });
  });

  /**
   * CU-13 · NOG manual: lo agrega a VC_Concursos con tipo MANUAL y prioridad alta; VC.Concurso lo captura
   * aunque no haya venido en el boletín (la API lo crea al recibir el detalle).
   */
  app.post('/app/concursos/manual', async (request, reply) => {
    const datos = Manual.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: datos.error.issues[0]?.message ?? 'NOG inválido' });
    if (!orchestratorActivo()) return reply.code(409).send({ error: 'Orchestrator no está configurado' });
    const { nog } = datos.data;
    const sello = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
    const elemento = await agregarElementoCola('VC_Concursos', `MANUAL-${nog}-${sello}`, {
      Nog: nog,
      Tipo: 'MANUAL',
      Url: `https://www.guatecompras.gt/concursos/consultaConcurso.aspx?o=5&nog=${nog}`,
    }, 'High');
    const existente = await prisma.concurso.findUnique({ where: { nog }, select: { titulo: true, estadoSistema: true } });
    return reply.code(201).send({ elementoId: elemento.Id, nog, yaRegistrado: !!existente, titulo: existente?.titulo ?? null });
  });
}
