import { prisma } from '../db.js';
import { EstadoEjecucion, type Prisma } from '../generated/prisma/client.js';
import { enlaceTrabajo, trabajosRecientes, type TrabajoOrchestrator } from './orchestrator.js';

/**
 * Bitácora de ejecuciones (CU-12, RF-CAP-08). La fuente es Orchestrator: cada trabajo se copia a
 * ejecucion_robot y se completa con lo que ese trabajo produjo en la base (concursos, documentos,
 * fichas, costo de IA, avisos, expedientes) dentro de su ventana de tiempo.
 */

const ESTADOS: Record<string, EstadoEjecucion> = {
  Successful: EstadoEjecucion.EXITOSA,
  Faulted: EstadoEjecucion.FALLIDA,
  Stopped: EstadoEjecucion.PARCIAL,
};

export function estadoDeTrabajo(estado: string): EstadoEjecucion {
  return ESTADOS[estado] ?? EstadoEjecucion.EN_CURSO;
}

/** Lo que un trabajo produjo en la base durante su ventana [inicio, fin]. */
async function metricas(proceso: string, inicio: Date, fin: Date) {
  const ventana = { gte: inicio, lte: fin };
  if (proceso === 'VC.Captura') return { concursosNuevos: await prisma.concurso.count({ where: { creadoEn: ventana } }) };
  if (proceso === 'VC.Concurso') {
    const [documentos, revisados] = await Promise.all([
      prisma.documento.count({ where: { creadoEn: ventana } }),
      prisma.concurso.count({ where: { revisadoEn: ventana } }),
    ]);
    return { documentosDescargados: documentos, concursosRevisados: revisados };
  }
  if (proceso.startsWith('VC.Analisis')) {
    const [fichas, ia] = await Promise.all([
      prisma.ficha.count({ where: { generadoEn: ventana } }),
      prisma.usoIa.aggregate({ where: { creadoEn: ventana }, _sum: { costoUsd: true }, _count: true }),
    ]);
    return { fichas, llamadasIa: ia._count, costoIaUsd: Number(ia._sum.costoUsd ?? 0) };
  }
  if (proceso === 'VC.Notificador') {
    const avisos = await prisma.notificacion.groupBy({ by: ['canal', 'estado'], where: { enviadoEn: ventana }, _count: true });
    return { avisos: Object.fromEntries(avisos.map((a) => [`${a.canal}_${a.estado}`.toLowerCase(), a._count])) };
  }
  if (proceso === 'VC.Expediente') return { expedientes: await prisma.expediente.count({ where: { generadoEn: ventana } }) };
  return {};
}

/** Copia los últimos trabajos de Orchestrator. Los terminados ya guardados no se recalculan. */
export async function sincronizarEjecuciones(cantidad = 100) {
  const trabajos = await trabajosRecientes(cantidad);
  const terminados = new Set(
    (await prisma.ejecucionRobot.findMany({
      where: { jobKey: { in: trabajos.map((t) => t.Key) }, estado: { not: EstadoEjecucion.EN_CURSO } },
      select: { jobKey: true },
    })).map((e) => e.jobKey),
  );
  for (const t of trabajos) {
    if (terminados.has(t.Key)) continue;
    await guardar(t);
  }
  return trabajos.length;
}

async function guardar(t: TrabajoOrchestrator) {
  const inicio = new Date(t.StartTime ?? t.CreationTime);
  const fin = t.EndTime ? new Date(t.EndTime) : null;
  const m = await metricas(t.ReleaseName, inicio, fin ?? new Date());
  const datos = {
    proceso: t.ReleaseName,
    estado: estadoDeTrabajo(t.State),
    inicio,
    fin,
    concursosNuevos: 'concursosNuevos' in m ? m.concursosNuevos : 0,
    documentosDescargados: 'documentosDescargados' in m ? m.documentosDescargados : 0,
    excepcionesSistema: t.State === 'Faulted' ? 1 : 0,
    detalle: {
      idOrchestrator: t.Id, estadoOrchestrator: t.State, info: t.Info, maquina: t.HostMachineName,
      origen: t.SourceType ?? t.Source, tipo: t.Type, enlace: enlaceTrabajo(t.Id), metricas: m,
    } as Prisma.InputJsonValue,
  };
  await prisma.ejecucionRobot.upsert({ where: { jobKey: t.Key }, create: { jobKey: t.Key, ...datos }, update: datos });
}

/** Resumen de los últimos días: tasa de éxito por proceso (meta del entregable 3: ≥ 95 %). */
export function tasaDeExito(ejecuciones: { proceso: string; estado: EstadoEjecucion }[]) {
  const porProceso = new Map<string, { total: number; exitosas: number }>();
  for (const e of ejecuciones) {
    if (e.estado === EstadoEjecucion.EN_CURSO) continue;
    const p = porProceso.get(e.proceso) ?? { total: 0, exitosas: 0 };
    p.total++;
    if (e.estado === EstadoEjecucion.EXITOSA) p.exitosas++;
    porProceso.set(e.proceso, p);
  }
  const total = [...porProceso.values()].reduce((s, p) => ({ total: s.total + p.total, exitosas: s.exitosas + p.exitosas }), { total: 0, exitosas: 0 });
  return {
    total: total.total,
    exitosas: total.exitosas,
    tasa: total.total ? Math.round((total.exitosas / total.total) * 1000) / 10 : null,
    procesos: [...porProceso].map(([proceso, p]) => ({ proceso, ...p, tasa: Math.round((p.exitosas / p.total) * 1000) / 10 })),
  };
}
