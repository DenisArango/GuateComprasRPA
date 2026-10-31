import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';

// Usa la base de datos de desarrollo (Docker). Los datos de prueba usan NOG 991xxxxx y se borran al final.
const app = crearApp();
const NOG = '99100001';
const ENTIDAD = 'ENTIDAD DE PRUEBA CONCURSOS';
const headers = { 'x-robot-clave': config.ROBOT_API_CLAVE };

const detalle = {
  titulo: 'Adquisición de guantes de nitrilo',
  entidad: ENTIDAD,
  unidadCompradora: 'Hospital de prueba',
  modalidad: 'Cotización (Art. 38 LCE)',
  estadoGc: 'Vigente',
  montoEstimado: 180000,
  fechaCierre: '2026-11-05T10:00:00',
  documentos: [{ nombre: 'Bases de cotización.pdf', publicadoEn: '2026-10-29' }],
  aclaraciones: 0,
};

async function limpiar() {
  const concursos = await prisma.concurso.findMany({ where: { nog: { startsWith: '991' } }, select: { id: true } });
  const ids = concursos.map((c) => c.id);
  await prisma.cambioConcurso.deleteMany({ where: { concursoId: { in: ids } } });
  await prisma.documento.deleteMany({ where: { concursoId: { in: ids } } });
  await prisma.concurso.deleteMany({ where: { id: { in: ids } } });
  await prisma.entidad.deleteMany({ where: { nombre: ENTIDAD } });
}

beforeAll(limpiar);
afterAll(async () => {
  await limpiar();
  await app.close();
  await prisma.$disconnect();
});

const enviarDetalle = (cuerpo: object, nog = NOG) =>
  app.inject({ method: 'PUT', url: `/robot/concursos/${nog}/detalle`, headers, payload: cuerpo });

function subir(contenido: string, nombre: string, nog = NOG) {
  const formulario = new FormData();
  formulario.append('nombre', nombre);
  formulario.append('archivo', new Blob([contenido], { type: 'application/pdf' }), nombre);
  return app.inject({ method: 'POST', url: `/robot/concursos/${nog}/documentos`, headers, payload: formulario });
}

describe('rutas de VC.Concurso', () => {
  it('un NOG desconocido sin entidad no se puede registrar', async () => {
    expect((await enviarDetalle({ ...detalle, entidad: null })).statusCode).toBe(400);
  });

  it('la primera captura registra el concurso sin cambios', async () => {
    const respuesta = await enviarDetalle(detalle);
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({ primeraCaptura: true, cambios: [], hashesConocidos: [] });
    expect((await prisma.concurso.findUniqueOrThrow({ where: { nog: NOG } })).estadoSistema).toBe('CAPTURADO');
  });

  it('sube un documento una sola vez (RN-02)', async () => {
    const primero = await subir('%PDF-1.4 contenido de prueba', 'Bases de cotización.pdf');
    expect(primero.statusCode).toBe(201);
    expect(primero.json()).toMatchObject({ nuevo: true, tipo: 'BASES' });

    const repetido = await subir('%PDF-1.4 contenido de prueba', 'Bases (copia).pdf');
    expect(repetido.json()).toMatchObject({ nuevo: false, documentoId: primero.json().documentoId });
  });

  it('rechaza documentos de concursos no registrados y archivos vacíos', async () => {
    expect((await subir('%PDF', 'x.pdf', '99199999')).statusCode).toBe(404);
    expect((await subir('', 'vacio.pdf')).statusCode).toBe(422);
  });

  it('la revisión detecta la adenda y la nueva fecha, y devuelve los hashes conocidos', async () => {
    const respuesta = await enviarDetalle({
      ...detalle,
      fechaCierre: '2026-11-12T10:00:00',
      documentos: [...detalle.documentos, { nombre: 'Adenda No. 1.pdf', publicadoEn: '2026-11-02' }],
    });
    const cuerpo = respuesta.json();
    expect(cuerpo.primeraCaptura).toBe(false);
    expect(cuerpo.cambios.map((c: { tipo: string }) => c.tipo)).toEqual(['FECHA', 'DOCUMENTO']);
    expect(cuerpo.hashesConocidos).toHaveLength(1);
    expect(await prisma.cambioConcurso.count({ where: { concurso: { nog: NOG } } })).toBe(2);
  });
});
