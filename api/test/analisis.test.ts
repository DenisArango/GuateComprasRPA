import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import type { Ficha } from '../src/domain/ficha.js';

// Usa la base de datos de desarrollo (Docker). Los datos de prueba usan NOG 992xxxxx y se borran al final.
const app = crearApp();
const NOG = '99200001';
const ENTIDAD = 'ENTIDAD DE PRUEBA ANALISIS';
const headers = { 'x-robot-clave': config.ROBOT_API_CLAVE };

const ficha: Ficha = {
  resumen: 'El hospital compra guantes de nitrilo. El monto estimado es de Q180,000. Las ofertas se reciben hasta el 5 de noviembre.',
  objeto: 'Guantes de nitrilo',
  items: [{ descripcion: 'Guantes de nitrilo', cantidad: 5000, unidad: 'caja' }],
  montoEstimado: 180000,
  moneda: 'GTQ',
  fechaLimiteOfertas: '2026-11-05T10:00:00',
  plazoEntrega: null,
  lugarEntrega: null,
  requisitos: [{ tipo: 'legal', descripcion: 'Constancia de inscripción en el RGAE', documento: 'RGAE', obligatorio: true, pagina: 2, posibleRestrictivo: false, motivoRestrictivo: null }],
  garantias: [],
  criteriosCalificacion: [{ criterio: 'Precio más bajo', ponderacion: 100, pagina: 3 }],
  formaPago: null,
  observaciones: [],
};

async function limpiar() {
  const ids = (await prisma.concurso.findMany({ where: { nog: { startsWith: '992' } }, select: { id: true } })).map((c) => c.id);
  await prisma.usoIa.deleteMany({ where: { concursoId: { in: ids } } });
  await prisma.ficha.deleteMany({ where: { concursoId: { in: ids } } });
  await prisma.documento.deleteMany({ where: { concursoId: { in: ids } } });
  await prisma.coincidencia.deleteMany({ where: { concursoId: { in: ids } } });
  await prisma.concurso.deleteMany({ where: { id: { in: ids } } });
  await prisma.entidad.deleteMany({ where: { nombre: ENTIDAD } });
}

let documentoId: number;

beforeAll(async () => {
  await limpiar();
  await app.inject({
    method: 'PUT', url: `/robot/concursos/${NOG}/detalle`, headers,
    payload: {
      titulo: 'Guantes', entidad: ENTIDAD, unidadCompradora: null, modalidad: 'Cotización', estadoGc: 'Vigente',
      montoEstimado: 180000, fechaCierre: '2026-11-05T10:00:00', documentos: [{ nombre: 'Bases.pdf', publicadoEn: null }], aclaraciones: 0,
    },
  });
  const formulario = new FormData();
  formulario.append('archivo', new Blob(['%PDF-1.4 bases de prueba']), 'Bases.pdf');
  documentoId = (await app.inject({ method: 'POST', url: `/robot/concursos/${NOG}/documentos`, headers, payload: formulario })).json().documentoId;
});

afterAll(async () => {
  await limpiar();
  await app.close();
  await prisma.$disconnect();
});

const guardar = (cuerpo: object) => app.inject({ method: 'POST', url: `/robot/concursos/${NOG}/ficha`, headers, payload: cuerpo });
const base = { modelo: 'claude-opus-5-5', tokensEntrada: 15000, tokensSalida: 4000, validadaPor: 'IA' };

describe('rutas de VC.Analisis', () => {
  it('publica el esquema de la ficha', async () => {
    const esquema = (await app.inject({ method: 'GET', url: '/robot/esquemas/ficha', headers })).json();
    expect(esquema.properties.requisitos).toBeDefined();
  });

  it('lista y descarga los documentos, y guarda el texto por página', async () => {
    const lista = (await app.inject({ method: 'GET', url: `/robot/concursos/${NOG}/documentos`, headers })).json();
    expect(lista).toEqual([expect.objectContaining({ id: documentoId, tipo: 'BASES', tieneTexto: false })]);

    const archivo = await app.inject({ method: 'GET', url: `/robot/documentos/${documentoId}/archivo`, headers });
    expect(archivo.body).toBe('%PDF-1.4 bases de prueba');

    const texto = await app.inject({
      method: 'PUT', url: `/robot/documentos/${documentoId}/texto`, headers,
      payload: { requiereOcr: false, paginas: [{ numero: 1, texto: 'Bases' }, { numero: 2, texto: 'Requisitos: constancia de inscripción en el RGAE' }, { numero: 3, texto: 'Criterio: precio más bajo' }] },
    });
    expect(texto.json()).toEqual({ documentoId, paginas: 3 });
  });

  it('registra el uso de IA y descuenta del presupuesto', async () => {
    const antes = (await app.inject({ method: 'GET', url: '/robot/ia/presupuesto', headers })).json();
    const uso = await app.inject({ method: 'POST', url: '/robot/ia/uso', headers, payload: { nog: NOG, modelo: 'claude-opus-5-5', tokensEntrada: 15000, tokensSalida: 4000 } });
    expect(uso.json().costoUsd).toBeCloseTo(0.14, 5);
    const despues = (await app.inject({ method: 'GET', url: '/robot/ia/presupuesto', headers })).json();
    expect(despues.gastadoHoyUsd - antes.gastadoHoyUsd).toBeCloseTo(0.14, 5);
  });

  it('rechaza una ficha inválida con errores para el reintento', async () => {
    const r = await guardar({ ...base, ficha: { ...ficha, moneda: 'USD' } });
    expect(r.statusCode).toBe(422);
    expect(r.json().errores.join(' ')).toMatch(/moneda/);
  });

  it('una ficha coherente queda ANALIZADO', async () => {
    const r = await guardar({ ...base, ficha });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ confianza: 1, requiereRevision: false });
    expect((await prisma.concurso.findUniqueOrThrow({ where: { nog: NOG } })).estadoSistema).toBe('ANALIZADO');
  });

  it('una fecha distinta a la del portal manda la ficha a revisión humana', async () => {
    const r = await guardar({ ...base, ficha: { ...ficha, fechaLimiteOfertas: '2026-11-20T10:00:00', montoEstimado: 999 } });
    expect(r.json(), r.body).toMatchObject({ requiereRevision: true });
    expect((await prisma.concurso.findUniqueOrThrow({ where: { nog: NOG } })).estadoSistema).toBe('REVISION_MANUAL');
  });

  it('registra la tarea de Action Center y la lista como pendiente de revisión', async () => {
    const r = await app.inject({ method: 'PUT', url: `/robot/concursos/${NOG}/ficha/tarea`, headers, payload: { tareaId: 777 } });
    expect(r.statusCode, r.body).toBe(200);
    const pendientes = (await app.inject({ method: 'GET', url: '/robot/fichas/en-revision', headers })).json();
    expect(pendientes).toContainEqual({ nog: NOG, tareaId: 777 });
  });

  it('devuelve el texto de los documentos por página', async () => {
    const texto = (await app.inject({ method: 'GET', url: `/robot/concursos/${NOG}/texto`, headers })).json();
    expect(texto.documentos[0]).toMatchObject({ id: documentoId, requiereOcr: false });
    expect(texto.documentos[0].paginas.map((p: { numero: number }) => p.numero)).toEqual([1, 2, 3]);
  });

  it('la ficha corregida por una persona queda ANALIZADO y reemplaza a la anterior', async () => {
    const r = await guardar({ ...base, validadaPor: 'HUMANO', tareaActionCenter: '12345', ficha: { ...ficha, fechaLimiteOfertas: '2026-11-20T10:00:00' } });
    expect(r.json().requiereRevision).toBe(false);
    const concurso = await prisma.concurso.findUniqueOrThrow({ where: { nog: NOG }, include: { ficha: true } });
    expect(concurso.estadoSistema).toBe('ANALIZADO');
    expect(concurso.ficha?.validadaPor).toBe('HUMANO');
    expect(await prisma.ficha.count({ where: { concursoId: concurso.id } })).toBe(1);

    const estado = (await app.inject({ method: 'GET', url: `/robot/concursos/${NOG}/ficha`, headers })).json();
    expect(estado).toMatchObject({ validadaPor: 'HUMANO', tareaActionCenter: '12345' });
  });
});
