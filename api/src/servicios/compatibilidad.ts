import { prisma } from '../db.js';
import { calcularCompatibilidad, type PerfilCompatibilidad } from '../domain/compatibilidad.js';
import type { Ficha } from '../domain/ficha.js';
import { EtapaCoincidencia, type Prisma } from '../generated/prisma/client.js';

const seleccionPerfil = {
  id: true, categorias: true, palabrasClave: true, departamentos: true, montoMin: true, montoMax: true,
  documentos: { select: { documentoNormalizado: true, venceEn: true } },
} satisfies Prisma.PerfilEmpresaSelect;

type PerfilBd = Prisma.PerfilEmpresaGetPayload<{ select: typeof seleccionPerfil }>;

function aPerfil(p: PerfilBd): PerfilCompatibilidad {
  return {
    id: p.id,
    categorias: p.categorias,
    palabrasClave: p.palabrasClave,
    departamentos: p.departamentos,
    montoMin: p.montoMin === null ? null : Number(p.montoMin),
    montoMax: p.montoMax === null ? null : Number(p.montoMax),
    documentos: p.documentos.map((d) => ({ documento: d.documentoNormalizado, venceEn: d.venceEn })),
  };
}

/**
 * Calcula la compatibilidad completa (con ficha) de los concursos indicados contra los perfiles
 * indicados, y la guarda como coincidencia COMPLETA (CU-04). Se llama al guardar una ficha y al
 * cambiar un perfil (CU-06).
 */
export async function recalcularCompatibilidad(filtro: { concursoIds?: number[]; perfilIds?: number[] }) {
  const perfiles = await prisma.perfilEmpresa.findMany({
    where: { activo: true, ...(filtro.perfilIds && { id: { in: filtro.perfilIds } }) },
    select: seleccionPerfil,
  });
  const concursos = await prisma.concurso.findMany({
    where: { ficha: { isNot: null }, ...(filtro.concursoIds && { id: { in: filtro.concursoIds } }) },
    select: { id: true, titulo: true, categorias: true, montoEstimado: true, fechaCierre: true, ficha: { select: { datosCompletos: true } } },
  });

  const hoy = new Date();
  const operaciones = concursos.flatMap((c) =>
    perfiles.map((p) => {
      const r = calcularCompatibilidad(
        c.ficha!.datosCompletos as unknown as Ficha,
        { titulo: c.titulo, categorias: c.categorias, montoPortal: c.montoEstimado ? Number(c.montoEstimado) : null, fechaCierre: c.fechaCierre },
        aPerfil(p),
        hoy,
      );
      const datos = { puntaje: r.puntaje, detalle: r.detalle, faltantes: r.faltantes, calculadoEn: hoy };
      return prisma.coincidencia.upsert({
        where: { concursoId_perfilId_etapa: { concursoId: c.id, perfilId: p.id, etapa: EtapaCoincidencia.COMPLETA } },
        create: { concursoId: c.id, perfilId: p.id, etapa: EtapaCoincidencia.COMPLETA, ...datos },
        update: datos,
      });
    }),
  );
  await prisma.$transaction(operaciones);
  return operaciones.length;
}
