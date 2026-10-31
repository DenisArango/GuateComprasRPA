import { prisma } from '../db.js';
import { recalcularRiesgos } from '../ocds/riesgos.js';
import { aniosPorDefecto, ejecutarCarga } from '../ocds/servicio.js';

/**
 * Carga inicial o manual del histórico OCDS (CU-11).
 *   npm run ocds:cargar -- 2025 2026     descarga, carga y recalcula
 *   npm run ocds:cargar -- --riesgos      solo recalcula las banderas rojas
 */
const argumentos = process.argv.slice(2);

if (argumentos.includes('--riesgos')) {
  console.time('banderas rojas');
  console.log(await recalcularRiesgos());
  console.timeEnd('banderas rojas');
} else {
  const anios = argumentos.map(Number).filter((n) => n >= 2020 && n <= 2100);
  const lista = anios.length ? anios : aniosPorDefecto();
  const carga = await prisma.ocdsCarga.create({ data: { anios: lista } });
  console.log(`Carga ${carga.id}: años ${lista.join(', ')}`);
  const reloj = setInterval(async () => {
    const c = await prisma.ocdsCarga.findUnique({ where: { id: carga.id } });
    console.log(`  ${c?.etapa} · ${c?.registros.toLocaleString('es-GT')} registros`);
  }, 15_000);
  await ejecutarCarga(carga.id, lista);
  clearInterval(reloj);
  const fin = await prisma.ocdsCarga.findUniqueOrThrow({ where: { id: carga.id } });
  console.log(`${fin.estado}: ${fin.etapa}${fin.error ? ` · ${fin.error}` : ''} · ${fin.registros.toLocaleString('es-GT')} registros`);
}
await prisma.$disconnect();
