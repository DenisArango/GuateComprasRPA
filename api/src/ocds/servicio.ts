import { prisma } from '../db.js';
import { EstadoCarga } from '../generated/prisma/client.js';
import { cargarArchivo, descargar } from './carga.js';
import { recalcularRiesgos } from './riesgos.js';

/** Años que se cargan por defecto: el año en curso y el anterior (la carga semanal de CU-11). */
export const aniosPorDefecto = () => { const a = new Date().getFullYear(); return [a - 1, a]; };

/**
 * Ejecuta una carga completa: descarga, carga y recálculo de banderas rojas. Registra el avance en
 * ocds_carga para que VC.Datos lo consulte (GET /robot/ocds/cargas/:id).
 */
export async function ejecutarCarga(id: number, anios: number[]) {
  let registros = 0;
  const avance = async (etapa: string, leidos: number) => {
    await prisma.ocdsCarga.update({ where: { id }, data: { etapa, registros: registros + leidos } });
  };
  try {
    for (const anio of anios) {
      await prisma.ocdsCarga.update({ where: { id }, data: { etapa: `descargando ${anio}` } });
      const archivo = await descargar(anio);
      registros += await cargarArchivo(archivo, avance);
    }
    await prisma.ocdsCarga.update({ where: { id }, data: { etapa: 'calculando banderas rojas', registros } });
    const conteo = await recalcularRiesgos();
    const indicadores = Object.values(conteo).reduce((s, n) => s + n, 0);
    await prisma.ocdsCarga.update({
      where: { id },
      data: { estado: EstadoCarga.EXITOSA, etapa: `terminada: ${Object.entries(conteo).map(([c, n]) => `${c} ${n}`).join(', ')}`, indicadores, fin: new Date() },
    });
  } catch (e) {
    await prisma.ocdsCarga.update({
      where: { id },
      data: { estado: EstadoCarga.FALLIDA, error: e instanceof Error ? e.message.slice(0, 1000) : String(e), fin: new Date() },
    });
  }
}

/** Inicia una carga en segundo plano; si ya hay una en curso, devuelve esa. */
export async function iniciarCarga(anios: number[]) {
  const enCurso = await prisma.ocdsCarga.findFirst({ where: { estado: EstadoCarga.EN_CURSO }, orderBy: { id: 'desc' } });
  // Una carga "en curso" de hace más de 6 horas quedó huérfana (la API se reinició)
  if (enCurso && Date.now() - enCurso.inicio.getTime() < 6 * 3_600_000) return { carga: enCurso, nueva: false };
  if (enCurso) await prisma.ocdsCarga.update({ where: { id: enCurso.id }, data: { estado: EstadoCarga.FALLIDA, error: 'Interrumpida', fin: new Date() } });
  const carga = await prisma.ocdsCarga.create({ data: { anios } });
  void ejecutarCarga(carga.id, anios);
  return { carga, nueva: true };
}
