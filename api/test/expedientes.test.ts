import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { checklist, documentosACopiar, faltantesDelChecklist } from '../src/domain/expediente.js';

const cierre = new Date('2026-11-10T00:00:00Z');
const requisito = (documento: string | null, obligatorio = true) => ({ tipo: 'legal', descripcion: `Requisito ${documento}`, documento, obligatorio, referencia: 'p. 3' });

describe('checklist del expediente', () => {
  const filas = checklist(
    [requisito('RTU'), requisito('SOLVENCIA_FISCAL'), requisito('CARTA_DISTRIBUIDOR'), requisito('OTRO'), requisito(null), requisito('RGAE', false)],
    [
      { documento: 'RTU', venceEn: null },
      { documento: 'SOLVENCIA_FISCAL', venceEn: new Date('2026-11-05T00:00:00Z') }, // vence antes del cierre
      { documento: 'RGAE', venceEn: new Date('2027-03-31T00:00:00Z') },
    ],
    cierre,
  );

  it('marca cada requisito como listo, vencido, faltante o por revisar', () => {
    expect(filas.map((f) => f.estado)).toEqual(['LISTO', 'VENCIDO', 'FALTANTE', 'REVISAR', 'REVISAR', 'LISTO']);
    expect(filas[1]).toMatchObject({ nombreDocumento: 'Solvencia fiscal', venceEn: '2026-11-05', referencia: 'p. 3' });
  });

  it('los faltantes son los obligatorios que no están o están vencidos; los vencidos no se copian (CP-17)', () => {
    expect(faltantesDelChecklist(filas)).toEqual(['SOLVENCIA_FISCAL', 'CARTA_DISTRIBUIDOR']);
    expect(documentosACopiar(filas)).toEqual(['RTU', 'RGAE']);
  });
});

// Recorrido de API contra la base de desarrollo (Docker). Datos con NOG 9936xxxx; se borran al final.
const app = crearApp();
const headers = { 'x-robot-clave': config.ROBOT_API_CLAVE };
const PERFIL = 'PERFIL DE PRUEBA EXPEDIENTES';
const ENTIDAD = 'ENTIDAD DE PRUEBA EXPEDIENTES';

async function limpiar() {
  const concursos = await prisma.concurso.findMany({ where: { nog: { startsWith: '9936' } }, select: { id: true } });
  const cids = concursos.map((c) => c.id);
  await prisma.expediente.deleteMany({ where: { concursoId: { in: cids } } });
  await prisma.ficha.deleteMany({ where: { concursoId: { in: cids } } });
  await prisma.documento.deleteMany({ where: { concursoId: { in: cids } } });
  await prisma.concurso.deleteMany({ where: { id: { in: cids } } });
  await prisma.entidad.deleteMany({ where: { nombre: ENTIDAD } });
  await prisma.perfilEmpresa.deleteMany({ where: { nombre: PERFIL } });
}

let perfilId = 0;
beforeAll(async () => {
  await limpiar();
  const entidad = await prisma.entidad.create({ data: { nombre: ENTIDAD } });
  const perfil = await prisma.perfilEmpresa.create({
    data: {
      nombre: PERFIL, nit: '1234567-8', activo: false, categorias: [], palabrasClave: [], modalidades: [],
      documentos: { create: [{ documentoNormalizado: 'RTU' }, { documentoNormalizado: 'SOLVENCIA_FISCAL', venceEn: new Date('2020-01-01T00:00:00Z') }] },
    },
  });
  perfilId = perfil.id;
  const crear = (nog: string, estadoSistema: 'ANALIZADO' | 'REVISION_MANUAL') => prisma.concurso.create({
    data: {
      nog, entidadId: entidad.id, titulo: `Computadoras ${nog}`, modalidad: 'Compra Directa', categorias: [], estadoSistema,
      url: 'https://www.guatecompras.gt', fechaCierre: new Date(Date.now() + 5 * 86_400_000),
      ficha: {
        create: {
          resumen: 'Compra de computadoras.', objeto: 'Computadoras', monto: 50000, garantias: [], datosCompletos: {}, confianza: 0.9,
          componentesConfianza: {}, validadaPor: 'IA', modeloIa: 'claude-opus-5-5', tokensEntrada: 1, tokensSalida: 1, costoUsd: 0,
          requisitos: { create: [
            { tipo: 'legal', descripcion: 'RTU actualizado', documentoNormalizado: 'RTU', obligatorio: true, posibleRestrictivo: false },
            { tipo: 'legal', descripcion: 'Solvencia fiscal', documentoNormalizado: 'SOLVENCIA_FISCAL', obligatorio: true, posibleRestrictivo: false },
          ] },
          criterios: { create: [{ criterio: 'Precio', ponderacion: 100 }] },
        },
      },
      documentos: { create: [{ nombreOriginal: '99360001@BASES.pdf', tipo: 'BASES', sha256: 'a'.repeat(64), rutaAlmacen: 'x', tamanoBytes: 1 }] },
    },
  });
  await crear('99360001', 'ANALIZADO');
  await crear('99360002', 'REVISION_MANUAL');
});

afterAll(async () => {
  await limpiar();
  await app.close();
  await prisma.$disconnect();
});

describe('rutas de expedientes', () => {
  it('entrega concurso, empresa, documentos y checklist', async () => {
    const r = await app.inject({ method: 'GET', url: `/robot/expedientes/99360001?perfilId=${perfilId}`, headers });
    expect(r.statusCode).toBe(200);
    const e = r.json();
    expect(e.concurso).toMatchObject({ nog: '99360001', entidad: ENTIDAD });
    expect(e.perfil).toMatchObject({ nombre: PERFIL, nit: '1234567-8' });
    expect(e.documentosConcurso).toEqual([expect.objectContaining({ nombre: '99360001@BASES.pdf', tipo: 'BASES' })]);
    expect(e.checklist.map((f: { estado: string }) => f.estado)).toEqual(['LISTO', 'VENCIDO']);
    expect(e.documentosACopiar).toEqual([{ codigo: 'RTU', nombre: 'Registro Tributario Unificado (RTU)' }]);
    expect(e.faltantes).toEqual(['SOLVENCIA_FISCAL']);
  });

  it('no arma expediente si la ficha espera validación o el concurso no existe', async () => {
    expect((await app.inject({ method: 'GET', url: `/robot/expedientes/99360002?perfilId=${perfilId}`, headers })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: `/robot/expedientes/99369999?perfilId=${perfilId}`, headers })).statusCode).toBe(404);
  });

  it('registra el expediente armado', async () => {
    const r = await app.inject({
      method: 'POST', url: '/robot/expedientes', headers,
      payload: { nog: '99360001', perfilId, ruta: 'C:\\Vigia\\Expedientes\\Expediente_99360001', faltantes: ['SOLVENCIA_FISCAL'], duracionSeg: 42 },
    });
    expect(r.statusCode).toBe(201);
    expect(await prisma.expediente.count({ where: { perfilId } })).toBe(1);
  });
});
