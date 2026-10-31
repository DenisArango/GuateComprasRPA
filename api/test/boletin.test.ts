import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import type { SolicitudBoletin } from '../src/routes/robot/boletin.js';

// Usa la base de datos de desarrollo (Docker). Los datos de prueba usan NOG 990xxxxx y se borran al final.
const app = crearApp();
const NOMBRE_PERFIL = 'Perfil de prueba automatizada';
const ENTIDAD = 'ENTIDAD DE PRUEBA AUTOMATIZADA';
const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function concurso(nog: string, descripcion: string, categorias = ['Salud e insumos hospitalarios']) {
  return {
    nog, seccion: 'CONCURSO' as const, fecha: `${manana}T00:00:00`, fechaTexto: null, modalidad: 'Cotización (Art. 38 LCE)',
    tipo: 'Público', entidad: ENTIDAD, unidadCompradora: null, descripcion,
    url: `https://www.guatecompras.gt/concursos/consultaConcurso.aspx?o=5&nog=${nog}`, categorias,
  };
}

const boletin: SolicitudBoletin = {
  fechaPublicacion: '2026-10-29',
  concursos: [
    concurso('99000001', 'Adquisición de guantes de látex'),
    concurso('99000002', 'Adquisición de papayas para el hospital'),
    { ...concurso('99000003', 'Proyecto de bases: jeringas'), seccion: 'PROYECTO_BASES' },
  ],
};

async function limpiar() {
  const concursos = await prisma.concurso.findMany({ where: { nog: { startsWith: '990' } }, select: { id: true } });
  await prisma.coincidencia.deleteMany({ where: { concursoId: { in: concursos.map((c) => c.id) } } });
  await prisma.concurso.deleteMany({ where: { nog: { startsWith: '990' } } });
  await prisma.entidad.deleteMany({ where: { nombre: ENTIDAD } });
  await prisma.perfilEmpresa.deleteMany({ where: { nombre: NOMBRE_PERFIL } });
}

beforeAll(async () => {
  await limpiar();
  await prisma.perfilEmpresa.create({ data: { nombre: NOMBRE_PERFIL, categorias: ['Salud e insumos hospitalarios'], palabrasClave: ['guante'], modalidades: [] } });
});

afterAll(async () => {
  await limpiar();
  await app.close();
  await prisma.$disconnect();
});

const enviar = (body: unknown, clave = config.ROBOT_API_CLAVE) =>
  app.inject({ method: 'POST', url: '/robot/boletin', headers: { 'x-robot-clave': clave }, payload: body as object });

describe('POST /robot/boletin', () => {
  it('rechaza solicitudes sin la clave de robot', async () => {
    expect((await enviar(boletin, 'clave-incorrecta-de-prueba')).statusCode).toBe(401);
  });

  it('rechaza un boletín mal formado', async () => {
    expect((await enviar({ fechaPublicacion: 'ayer', concursos: [] })).statusCode).toBe(400);
  });

  it('guarda los concursos y devuelve solo los candidatos compatibles', async () => {
    const respuesta = await enviar(boletin);
    expect(respuesta.statusCode).toBe(200);
    const cuerpo = respuesta.json();
    expect(cuerpo.recibidos).toBe(2); // el proyecto de bases no se registra
    expect(cuerpo.candidatos.map((c: { nog: string }) => c.nog)).toContain('99000001');
    expect(cuerpo.candidatos.map((c: { nog: string }) => c.nog)).not.toContain('99000002');

    const guardado = await prisma.concurso.findUniqueOrThrow({ where: { nog: '99000001' } });
    expect(guardado.estadoSistema).toBe('PRESELECCIONADO');
    expect((await prisma.concurso.findUniqueOrThrow({ where: { nog: '99000002' } })).estadoSistema).toBeNull();
  });

  it('no repite candidatos si el mismo boletín se envía otra vez', async () => {
    const cuerpo = (await enviar(boletin)).json();
    expect(cuerpo.nuevos).toBe(0);
    expect(cuerpo.candidatos.map((c: { nog: string }) => c.nog)).not.toContain('99000001');
  });
});
