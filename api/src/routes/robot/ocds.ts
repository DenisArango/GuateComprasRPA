import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { aniosPorDefecto, iniciarCarga } from '../../ocds/servicio.js';

export async function rutasOcds(app: FastifyInstance) {
  /**
   * POST /robot/ocds/cargas · VC.Datos inicia la carga semanal (CU-11). Responde enseguida (202):
   * la carga sigue en segundo plano y el robot consulta su estado cada minuto.
   */
  app.post('/robot/ocds/cargas', async (request, reply) => {
    const { anios } = z.object({ anios: z.array(z.number().int().min(2020).max(2100)).min(1).optional() }).parse(request.body ?? {});
    const { carga, nueva } = await iniciarCarga(anios ?? aniosPorDefecto());
    return reply.code(202).send({ id: carga.id, nueva, anios: carga.anios });
  });

  /** GET /robot/ocds/cargas/:id · estado de una carga: EN_CURSO, EXITOSA o FALLIDA. */
  app.get('/robot/ocds/cargas/:id', async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const carga = await prisma.ocdsCarga.findUnique({ where: { id } });
    if (!carga) return reply.code(404).send({ error: 'Carga no encontrada' });
    return carga;
  });
}
