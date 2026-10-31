import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashContrasena } from '../src/routes/app/autenticacion.js';

// CP-14 y CP-15 contra la base de desarrollo (Docker). Datos de prueba propios; se borran al final.
const app = crearApp();
const A = 'prueba-a-sesion@vigia.local';
const B = 'prueba-b-sesion@vigia.local';
const PERFIL_A = 'PERFIL DE PRUEBA SESION A';
const PERFIL_B = 'PERFIL DE PRUEBA SESION B';
const CONTRASENA = 'Contrasena-de-prueba-1';

async function limpiar() {
  await prisma.usuario.deleteMany({ where: { correo: { in: [A, B] } } });
  await prisma.perfilEmpresa.deleteMany({ where: { nombre: { in: [PERFIL_A, PERFIL_B] } } });
}

let perfilB = 0;
beforeAll(async () => {
  await limpiar();
  const hash = await hashContrasena(CONTRASENA);
  const base = { activo: false, categorias: [], palabrasClave: [], modalidades: [] };
  await prisma.perfilEmpresa.create({ data: { ...base, nombre: PERFIL_A, usuarios: { create: { correo: A, nombre: 'A', hashContrasena: hash } } } });
  perfilB = (await prisma.perfilEmpresa.create({ data: { ...base, nombre: PERFIL_B, usuarios: { create: { correo: B, nombre: 'B', hashContrasena: hash } } } })).id;
});

afterAll(async () => {
  await limpiar();
  await app.close();
  await prisma.$disconnect();
});

const ingresar = (correo: string, contrasena: string) => app.inject({ method: 'POST', url: '/app/sesion', payload: { correo, contrasena } });

describe('seguridad del dashboard', () => {
  it('CP-14: un usuario no puede ver el perfil de otra empresa (403)', async () => {
    const { token } = (await ingresar(A, CONTRASENA)).json();
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'GET', url: `/app/perfiles/${perfilB}`, headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/app/perfiles/${perfilB}/telegram`, headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/app/ejecuciones', headers })).statusCode).toBe(403); // solo administrador
  });

  it('CP-15: tras 5 intentos fallidos la cuenta se bloquea aunque luego use la contraseña correcta', async () => {
    for (let i = 0; i < 5; i++) expect((await ingresar(B, 'incorrecta')).statusCode).toBe(401);
    expect((await ingresar(B, CONTRASENA)).statusCode).toBe(423);
  });
});
