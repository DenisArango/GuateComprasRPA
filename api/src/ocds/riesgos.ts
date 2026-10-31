import pg from 'pg';
import { config } from '../config.js';
import { PARAMETROS_RIESGO, type ParametrosRiesgo } from '../domain/riesgos.js';

/**
 * Recalcula las banderas rojas sobre todo el histórico (docs/10-banderas-rojas.md, RN-07: solo procesos adjudicados).
 * Cada indicador es una consulta SQL; la evidencia se redacta como hecho verificable, nunca como acusación.
 * Devuelve el número de indicadores activados por código.
 */
export async function recalcularRiesgos(p: ParametrosRiesgo = PARAMETROS_RIESGO): Promise<Record<string, number>> {
  const cliente = new pg.Client({ connectionString: config.DATABASE_URL });
  await cliente.connect();
  await cliente.query("SET TIME ZONE 'UTC'");
  const conteo: Record<string, number> = {};
  const como = (columna: string, patrones: string[]) => `(${patrones.map((x) => `${columna} ILIKE ${literal(x)}`).join(' OR ')})`;
  const competitiva = como('p.modalidad', p.competitivas);
  const excluida = como('p.modalidad', p.excluidas);
  const directa = como('p.modalidad', p.directas);
  const moneda = (expr: string) => `'Q' || to_char(${expr}, 'FM999,999,999,990.00')`;
  const categoria = `CASE p.categoria WHEN 'goods' THEN 'bienes' WHEN 'services' THEN 'servicios' WHEN 'works' THEN 'obras' ELSE 'compras sin categoría' END`;

  const consultas: Record<string, string> = {
    'IR-01': `
      SELECT p.id, 1, 'Proceso por ' || p.modalidad || ' adjudicado con una sola oferta recibida.'
      FROM ocds_proceso p
      WHERE p.estado = 'Adjudicado' AND p.numero_ofertas = 1 AND ${competitiva}`,

    'IR-02': `
      WITH a AS (
        SELECT p.id AS proceso_id, p.comprador_id, p.comprador_nombre, coalesce(p.categoria, '') AS categoria, ${categoria} AS cat,
               extract(year FROM coalesce(a.fecha, p.fecha_publicacion))::int AS anio, a.proveedor_id, a.monto
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id
        WHERE p.estado = 'Adjudicado' AND a.estado = 'active' AND a.monto > 0 AND NOT ${excluida}),
      tot AS (SELECT comprador_id, categoria, anio, sum(monto) AS total, count(DISTINCT proceso_id) AS n FROM a GROUP BY 1, 2, 3),
      prov AS (SELECT comprador_id, categoria, anio, proveedor_id, sum(monto) AS m FROM a GROUP BY 1, 2, 3, 4)
      SELECT DISTINCT ON (a.proceso_id) a.proceso_id, round(prov.m / tot.total, 4),
        'El proveedor recibió el ' || round(100 * prov.m / tot.total) || ' % de lo que ' || a.comprador_nombre || ' adjudicó en '
          || a.cat || ' durante ' || a.anio || ' (' || ${moneda('prov.m')} || ' de ' || ${moneda('tot.total')} || ', ' || tot.n || ' procesos).'
      FROM a
      JOIN tot ON tot.comprador_id = a.comprador_id AND tot.categoria = a.categoria AND tot.anio = a.anio
      JOIN prov ON prov.comprador_id = a.comprador_id AND prov.categoria = a.categoria AND prov.anio = a.anio AND prov.proveedor_id = a.proveedor_id
      WHERE tot.total >= ${p.concentracionMontoMinimo} AND tot.n >= ${p.concentracionProcesosMinimos} AND prov.m / tot.total >= ${p.concentracionMinima}
      ORDER BY a.proceso_id, prov.m / tot.total DESC`,

    'IR-03': `
      WITH plazos AS (
        SELECT p.id, p.modalidad, extract(epoch FROM p.fin_ofertas - p.inicio_ofertas) / 86400 AS dias
        FROM ocds_proceso p
        WHERE ${competitiva} AND p.fin_ofertas > p.inicio_ofertas),
      ref AS (
        SELECT modalidad, percentile_cont(${p.plazoPercentil}) WITHIN GROUP (ORDER BY dias) AS limite, count(*) AS n
        FROM plazos GROUP BY modalidad HAVING count(*) >= ${p.plazoProcesosMinimos})
      SELECT x.id, round(x.dias::numeric, 2),
        'Plazo para ofertar de ' || trunc(x.dias::numeric, 1) || ' días; el ' || ${Math.round((1 - p.plazoPercentil) * 100)}
          || ' % de los procesos de ' || x.modalidad || ' tuvo al menos ' || (ceil(ref.limite::numeric * 10) / 10)::numeric(10, 1) || ' días.'
      FROM plazos x JOIN ref USING (modalidad) JOIN ocds_proceso p ON p.id = x.id
      WHERE p.estado = 'Adjudicado' AND x.dias < ref.limite`,

    'IR-04': `
      WITH d AS (
        SELECT p.id AS proceso_id, coalesce(p.unidad_id, p.comprador_id) AS unidad, coalesce(p.unidad_nombre, p.comprador_nombre) AS unidad_nombre,
          a.proveedor_id, coalesce(p.clasificaciones[1], '') AS familia,
          (coalesce(a.fecha, p.fecha_publicacion) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guatemala')::date AS f, a.monto
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id
        WHERE p.estado = 'Adjudicado' AND a.estado = 'active' AND a.monto > 0 AND ${directa}),
      -- Ventana deslizante por entidad y proveedor: cada compra abre una ventana con las que le siguen dentro del plazo
      ventanas AS (
        SELECT d.*, count(*) OVER w AS n, sum(monto) OVER w AS s
        FROM d
        WINDOW w AS (PARTITION BY unidad, proveedor_id, familia ORDER BY f RANGE BETWEEN CURRENT ROW AND interval '${p.fraccionamientoDias - 1} days' FOLLOWING)),
      -- Una compra queda marcada si cae dentro de alguna ventana que cumple: un ancla que la precede dentro del plazo
      cubiertas AS (
        SELECT proceso_id, unidad_nombre,
          max(CASE WHEN n >= ${p.fraccionamientoCompras} AND s > ${p.umbralCompraDirecta} THEN s END) OVER v AS s,
          max(CASE WHEN n >= ${p.fraccionamientoCompras} AND s > ${p.umbralCompraDirecta} THEN n END) OVER v AS n
        FROM ventanas
        WINDOW v AS (PARTITION BY unidad, proveedor_id, familia ORDER BY f RANGE BETWEEN interval '${p.fraccionamientoDias - 1} days' PRECEDING AND CURRENT ROW)),
      marcados AS (SELECT proceso_id, unidad_nombre, n, s FROM cubiertas WHERE s IS NOT NULL)
      SELECT DISTINCT ON (proceso_id) proceso_id, s,
        n || ' compras directas de ' || unidad_nombre || ' al mismo proveedor, del mismo producto y ${p.fraccionamientoDias === 1 ? 'el mismo día' : `en ${p.fraccionamientoDias} días`}, suman ' || ${moneda('s')}
          || ', más que el monto máximo de una compra directa (' || ${moneda(String(p.umbralCompraDirecta))} || ').'
      FROM marcados ORDER BY proceso_id, s DESC`,

    'IR-05': `
      WITH a AS (
        SELECT p.id AS proceso_id, coalesce(p.categoria, '') AS categoria, ${categoria} AS cat, p.modalidad, a.proveedor_id, a.monto, coalesce(a.fecha, p.fecha_publicacion) AS f
        FROM ocds_adjudicacion a JOIN ocds_proceso p ON p.id = a.proceso_id
        WHERE p.estado = 'Adjudicado' AND a.estado = 'active' AND a.monto > 0 AND NOT ${excluida}),
      inicio AS (SELECT min(f) AS desde FROM a),
      primero AS (SELECT proveedor_id, min(f) AS f FROM a GROUP BY proveedor_id),
      ref AS (SELECT categoria, modalidad, percentile_cont(${p.proveedorNuevoPercentil}) WITHIN GROUP (ORDER BY monto) AS limite FROM a GROUP BY 1, 2 HAVING count(*) >= 30)
      SELECT DISTINCT ON (a.proceso_id) a.proceso_id, a.monto,
        'Primer contrato del proveedor en los datos disponibles (desde ' || to_char(inicio.desde, 'DD/MM/YYYY') || '), por ' || ${moneda('a.monto')}
          || '; el ' || ${Math.round(p.proveedorNuevoPercentil * 100)} || ' % de las adjudicaciones de ' || a.cat || ' por ' || a.modalidad || ' son menores de ' || ${moneda('ref.limite')} || '.'
      FROM a JOIN primero ON primero.proveedor_id = a.proveedor_id AND primero.f = a.f
      JOIN ref ON ref.categoria = a.categoria AND ref.modalidad = a.modalidad
      CROSS JOIN inicio
      WHERE a.f >= inicio.desde + interval '${p.proveedorNuevoHistoriaDias} days' AND a.monto > ref.limite
      ORDER BY a.proceso_id, a.monto DESC`,

    'IR-08': `
      WITH tasas AS (
        SELECT p.comprador_id, avg((p.estado = 'Desierto')::int) AS tasa, count(*) AS n
        FROM ocds_proceso p WHERE ${competitiva} AND p.estado IN ('Adjudicado', 'Desierto')
        GROUP BY p.comprador_id HAVING count(*) >= ${p.desiertosProcesosMinimos}),
      ref AS (SELECT percentile_cont(${p.desiertosPercentil}) WITHIN GROUP (ORDER BY tasa) AS limite FROM tasas)
      SELECT p.id, round(t.tasa, 4),
        p.comprador_nombre || ' declaró desiertos el ' || round(100 * t.tasa) || ' % de sus cotizaciones y licitaciones (' || t.n
          || ' procesos); el ' || ${Math.round(p.desiertosPercentil * 100)} || ' % de las entidades está en ' || round(100 * ref.limite) || ' % o menos. Este proceso es una adquisición directa por ausencia de oferta.'
      FROM ocds_proceso p JOIN tasas t ON t.comprador_id = p.comprador_id CROSS JOIN ref
      WHERE p.modalidad ILIKE 'Adquisición Directa por Ausencia de Oferta%' AND p.estado = 'Adjudicado' AND t.tasa > ref.limite`,
  };

  try {
    await cliente.query('BEGIN');
    await cliente.query('DELETE FROM indicador_riesgo');
    for (const [codigo, sql] of Object.entries(consultas)) {
      const r = await cliente.query(
        `INSERT INTO indicador_riesgo (proceso_id, codigo, valor, evidencia)
         SELECT q.proceso_id, ${literal(codigo)}, q.valor, q.evidencia FROM (${sql}) AS q(proceso_id, valor, evidencia)
         ON CONFLICT (proceso_id, codigo) DO NOTHING`,
      );
      conteo[codigo] = r.rowCount ?? 0;
    }
    // Puntaje compuesto (10.4): pesos de los indicadores activados sobre la suma de todos los pesos
    const pesos = Object.entries(p.pesos);
    const total = pesos.reduce((s, [, w]) => s + w, 0);
    await cliente.query(`UPDATE ocds_proceso SET puntaje_riesgo = 0 WHERE puntaje_riesgo <> 0`);
    await cliente.query(
      `UPDATE ocds_proceso p SET puntaje_riesgo = least(100, round(100.0 * s.suma / ${total}))
       FROM (SELECT i.proceso_id, sum(w.peso) AS suma FROM indicador_riesgo i
             JOIN (VALUES ${pesos.map(([c, w]) => `(${literal(c)}, ${w})`).join(', ')}) AS w(codigo, peso) ON w.codigo = i.codigo
             GROUP BY i.proceso_id) s
       WHERE s.proceso_id = p.id`,
    );
    await cliente.query('COMMIT');
    return conteo;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    await cliente.end();
  }
}

/** Texto SQL entre comillas simples (solo para parámetros de configuración, no para entradas de usuarios). */
function literal(texto: string) {
  return `'${texto.replace(/'/g, "''")}'`;
}
