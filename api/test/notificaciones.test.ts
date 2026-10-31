import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { diasEntre, documentosPorVencer, oportunidadesNuevas, tocaRecordatorio } from '../src/domain/notificaciones.js';

const hoy = new Date(Date.UTC(2026, 9, 31));
const en = (d: number) => new Date(hoy.getTime() + d * 86_400_000);

describe('reglas de notificación', () => {
  const base = { notificado: false, descartado: false, fechaCierre: en(5) };

  it('elige la coincidencia completa, aplica umbrales y descarta lo vencido, notificado o descartado', () => {
    const r = oportunidadesNuevas([
      { ...base, concursoId: 1, etapa: 'PRELIMINAR' as const, puntaje: 90 },
      { ...base, concursoId: 1, etapa: 'COMPLETA' as const, puntaje: 55 }, // la completa manda: bajo el umbral 60
      { ...base, concursoId: 2, etapa: 'COMPLETA' as const, puntaje: 70 },
      { ...base, concursoId: 3, etapa: 'PRELIMINAR' as const, puntaje: 80, fechaCierre: en(-1) },
      { ...base, concursoId: 4, etapa: 'PRELIMINAR' as const, puntaje: 80, notificado: true },
      { ...base, concursoId: 5, etapa: 'PRELIMINAR' as const, puntaje: 80, descartado: true },
      { ...base, concursoId: 6, etapa: 'PRELIMINAR' as const, puntaje: 95, fechaCierre: null },
    ], 60, hoy);
    expect(r.map((c) => c.concursoId)).toEqual([6, 2]);
  });

  it('recuerda exactamente 3 y 1 días antes del cierre', () => {
    expect(tocaRecordatorio(en(3), hoy, [3, 1])).toBe(3);
    expect(tocaRecordatorio(en(1), hoy, [3, 1])).toBe(1);
    expect(tocaRecordatorio(en(2), hoy, [3, 1])).toBeNull();
    expect(tocaRecordatorio(null, hoy, [3, 1])).toBeNull();
  });

  it('avisa documentos que vencen en la ventana, del más próximo al más lejano', () => {
    const r = documentosPorVencer([{ venceEn: en(40) }, { venceEn: en(10) }, { venceEn: en(-2) }, { venceEn: null }, { venceEn: en(0) }], hoy, 30);
    expect(r.map((d) => d.dias)).toEqual([0, 10]);
    expect(diasEntre(hoy, new Date('2026-11-05T00:00:00Z'))).toBe(5);
  });
});

// Recorrido de API contra la base de desarrollo (Docker). Datos con NOG 993xxxxx; se borran al final.
const app = crearApp();
const headers = { 'x-robot-clave': config.ROBOT_API_CLAVE };
const PERFIL = 'PERFIL DE PRUEBA NOTIFICACIONES';
const CORREO = 'prueba-notificaciones@vigia.local';
const ENTIDAD = 'ENTIDAD DE PRUEBA NOTIFICACIONES';

async function limpiar() {
  const perfiles = await prisma.perfilEmpresa.findMany({ where: { nombre: PERFIL }, select: { id: true } });
  const ids = perfiles.map((p) => p.id);
  const concursos = await prisma.concurso.findMany({ where: { nog: { startsWith: '9935' } }, select: { id: true } });
  const cids = concursos.map((c) => c.id);
  await prisma.notificacion.deleteMany({ where: { perfilId: { in: ids } } });
  await prisma.seguimiento.deleteMany({ where: { OR: [{ perfilId: { in: ids } }, { concursoId: { in: cids } }] } });
  await prisma.coincidencia.deleteMany({ where: { OR: [{ perfilId: { in: ids } }, { concursoId: { in: cids } }] } });
  await prisma.cambioConcurso.deleteMany({ where: { concursoId: { in: cids } } });
  await prisma.concurso.deleteMany({ where: { id: { in: cids } } });
  await prisma.entidad.deleteMany({ where: { nombre: ENTIDAD } });
  await prisma.usuario.deleteMany({ where: { correo: CORREO } });
  await prisma.perfilEmpresa.deleteMany({ where: { id: { in: ids } } });
}

let perfilId = 0;
beforeAll(async () => {
  await limpiar();
  const entidad = await prisma.entidad.create({ data: { nombre: ENTIDAD } });
  const perfil = await prisma.perfilEmpresa.create({
    data: {
      nombre: PERFIL, categorias: [], palabrasClave: ['guante'], modalidades: [], umbralCompatibilidad: 60,
      documentos: { create: [{ documentoNormalizado: 'SOLVENCIA_FISCAL', venceEn: new Date(Date.now() + 10 * 86_400_000) }] },
      usuarios: { create: { correo: CORREO, nombre: 'Prueba', hashContrasena: 'x' } },
    },
  });
  perfilId = perfil.id;
  const hoyUtc = new Date(new Date().toISOString().slice(0, 10));
  const crear = (nog: string, dias: number) => prisma.concurso.create({
    data: { nog, entidadId: entidad.id, titulo: `Guantes ${nog}`, modalidad: 'Cotización', categorias: [], url: 'https://www.guatecompras.gt', fechaCierre: new Date(hoyUtc.getTime() + dias * 86_400_000) },
  });
  const nuevo = await crear('99350001', 6);
  const seguido = await crear('99350002', 3);
  await prisma.coincidencia.create({ data: { concursoId: nuevo.id, perfilId, etapa: 'PRELIMINAR', puntaje: 80, detalle: {} } });
  await prisma.coincidencia.create({ data: { concursoId: nuevo.id, perfilId, etapa: 'COMPLETA', puntaje: 75, detalle: {}, faltantes: ['CARTA_DISTRIBUIDOR'] } });
  await prisma.seguimiento.create({ data: { perfilId, concursoId: seguido.id, estado: 'SIGUIENDO' } });
  await prisma.cambioConcurso.create({ data: { concursoId: seguido.id, tipo: 'FECHA', resumenIa: 'La fecha de cierre pasó al 3 de noviembre.' } });
});

afterAll(async () => {
  await limpiar();
  await app.close();
  await prisma.$disconnect();
});

describe('rutas de notificaciones', () => {
  const resumenDelPerfil = async () => {
    const r = await app.inject({ method: 'GET', url: '/robot/notificaciones/resumen', headers });
    expect(r.statusCode).toBe(200);
    return r.json().perfiles.find((p: { perfilId: number }) => p.perfilId === perfilId);
  };

  it('arma el resumen: oportunidad nueva con faltantes, recordatorio y documento por vencer', async () => {
    const p = await resumenDelPerfil();
    expect(p.destinatarios).toEqual([{ correo: CORREO, nombre: 'Prueba' }]);
    expect(p.oportunidades).toHaveLength(1);
    expect(p.oportunidades[0]).toMatchObject({ nog: '99350001', puntaje: 75, etapa: 'COMPLETA', faltantes: ['Carta de distribuidor autorizado'], diasParaCierre: 6 });
    expect(p.recordatorios.map((r: { nog: string }) => r.nog)).toEqual(['99350002']);
    expect(p.documentosPorVencer[0]).toMatchObject({ documento: 'Solvencia fiscal', dias: 10 });
  });

  it('incluye los chats de Telegram vinculados al perfil (RF-NOT-02)', async () => {
    await prisma.perfilEmpresa.update({ where: { id: perfilId }, data: { telegramChats: ['123456'] } });
    const p = await resumenDelPerfil();
    expect(p.telegram).toEqual(['123456']);
    await prisma.perfilEmpresa.update({ where: { id: perfilId }, data: { telegramChats: [] } });
  });

  it('aviso de cambio para quienes siguen el concurso', async () => {
    const r = await app.inject({ method: 'GET', url: '/robot/notificaciones/aviso?nog=99350002&tipo=CAMBIO', headers });
    expect(r.statusCode).toBe(200);
    const aviso = r.json();
    expect(aviso.concurso.cambios[0].resumen).toContain('3 de noviembre');
    expect(aviso.perfiles.map((p: { perfilId: number }) => p.perfilId)).toContain(perfilId);
  });

  it('aviso de ficha a los perfiles compatibles', async () => {
    const r = await app.inject({ method: 'GET', url: '/robot/notificaciones/aviso?nog=99350001&tipo=FICHA', headers });
    expect(r.json().perfiles.find((p: { perfilId: number }) => p.perfilId === perfilId)).toMatchObject({ puntaje: 75 });
  });

  it('al registrar el envío, la oportunidad no se repite al día siguiente', async () => {
    const r = await app.inject({
      method: 'POST', url: '/robot/notificaciones', headers,
      payload: { perfilId, tipo: 'RESUMEN', estado: 'ENVIADO', destinatarios: [CORREO], asunto: 'Resumen', nogs: ['99350001'] },
    });
    expect(r.statusCode).toBe(201);
    const p = await resumenDelPerfil();
    expect(p.oportunidades).toHaveLength(0);
    expect(await prisma.notificacion.count({ where: { perfilId } })).toBe(1);
  });

  it('rechaza un registro sin destinatarios y pide la clave de robot', async () => {
    const r = await app.inject({ method: 'POST', url: '/robot/notificaciones', headers, payload: { perfilId, tipo: 'RESUMEN', estado: 'ENVIADO', destinatarios: [], asunto: 'x' } });
    expect(r.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/robot/notificaciones/resumen' })).statusCode).toBe(401);
  });
});
