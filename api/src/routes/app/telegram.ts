import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { crearVinculo, nombreDelBot, sincronizarVinculos, telegramActivo } from '../../servicios/telegram.js';
import { exigirSesion, puedeVerPerfil } from './autenticacion.js';

const Id = z.object({ id: z.coerce.number().int().positive() });

/** Avisos por Telegram de un perfil (RF-NOT-02): estado, vincular un chat y desvincular. */
export async function rutasTelegramApp(app: FastifyInstance) {
  app.addHook('onRequest', exigirSesion);

  /** Estado. Antes revisa si llegaron vinculaciones nuevas al bot. */
  app.get('/app/perfiles/:id/telegram', async (request, reply) => {
    const { id } = Id.parse(request.params);
    if (!(await puedeVerPerfil(request.user, id))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
    if (!telegramActivo()) return { disponible: false, bot: null, chats: 0 };
    let error: string | null = null;
    try { await sincronizarVinculos(); } catch (e) { error = (e as Error).message; request.log.warn(e, 'Telegram'); }
    const perfil = await prisma.perfilEmpresa.findUnique({ where: { id }, select: { telegramChats: true } });
    return { disponible: true, bot: await nombreDelBot().catch(() => null), chats: perfil?.telegramChats.length ?? 0, error };
  });

  /** Genera el enlace de vinculación (válido 15 minutos). */
  app.post('/app/perfiles/:id/telegram', async (request, reply) => {
    const { id } = Id.parse(request.params);
    if (!(await puedeVerPerfil(request.user, id))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
    if (!telegramActivo()) return reply.code(409).send({ error: 'Telegram no está configurado (TELEGRAM_BOT_TOKEN)' });
    return crearVinculo(id);
  });

  /** Quita todos los chats vinculados al perfil. */
  app.delete('/app/perfiles/:id/telegram', async (request, reply) => {
    const { id } = Id.parse(request.params);
    if (!(await puedeVerPerfil(request.user, id))) return reply.code(403).send({ error: 'Sin acceso a este perfil' });
    await prisma.perfilEmpresa.update({ where: { id }, data: { telegramChats: [] } });
    return reply.code(204).send();
  });
}
