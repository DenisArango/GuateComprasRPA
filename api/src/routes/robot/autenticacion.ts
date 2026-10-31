import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Las rutas /robot/* solo aceptan la clave de robot (encabezado X-Robot-Clave),
 * la misma que guarda el asset VC_ApiClave en Orchestrator.
 */
export function exigirClaveRobot(clave: string) {
  const esperada = Buffer.from(clave);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const recibida = Buffer.from(String(request.headers['x-robot-clave'] ?? ''));
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      return reply.code(401).send({ error: 'Clave de robot inválida' });
    }
  };
}
