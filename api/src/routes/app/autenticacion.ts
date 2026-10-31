import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';

export interface UsuarioSesion {
  id: number;
  correo: string;
  nombre: string;
  rol: 'PROVEEDOR' | 'ANALISTA' | 'ADMIN';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UsuarioSesion;
    user: UsuarioSesion;
  }
}

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

export const hashContrasena = (contrasena: string) => hash(contrasena);

/** Hook para las rutas del dashboard: exige un JWT válido. */
export async function exigirSesion(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Sesión inválida o vencida' });
  }
}

/** El usuario puede ver el perfil si lo administra o es ADMIN (RNF-09). */
export async function puedeVerPerfil(usuario: UsuarioSesion, perfilId: number) {
  if (usuario.rol === 'ADMIN') return true;
  return (await prisma.perfilEmpresa.count({ where: { id: perfilId, usuarios: { some: { id: usuario.id } } } })) > 0;
}

const Login = z.object({ correo: z.email(), contrasena: z.string().min(1) });

export async function rutasAutenticacion(app: FastifyInstance) {
  /** CU-15: correo y contraseña; bloqueo temporal tras 5 intentos fallidos. */
  app.post('/app/sesion', async (request, reply) => {
    const datos = Login.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Correo o contraseña con formato inválido' });
    const { correo, contrasena } = datos.data;

    const usuario = await prisma.usuario.findUnique({ where: { correo: correo.toLowerCase() } });
    const generico = { error: 'Correo o contraseña incorrectos' };
    if (!usuario || !usuario.activo) return reply.code(401).send(generico);
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      return reply.code(423).send({ error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.' });
    }

    if (!(await verify(usuario.hashContrasena, contrasena))) {
      const intentos = usuario.intentosFallidos + 1;
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: intentos >= MAX_INTENTOS
          ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) }
          : { intentosFallidos: intentos },
      });
      return reply.code(401).send(generico);
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
    const sesion: UsuarioSesion = { id: usuario.id, correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol };
    return { token: app.jwt.sign(sesion), usuario: sesion };
  });

  app.get('/app/sesion', { onRequest: exigirSesion }, async (request) => request.user);
}
