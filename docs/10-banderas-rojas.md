# 10 · Motor de banderas rojas

## 10.1 Propósito

Identificar procesos de contratación con **señales que ameritan revisión**, a partir de los datos abiertos OCDS. Los indicadores se basan en la metodología de *red flags* para contrataciones públicas de la **Open Contracting Partnership** y se adaptan al marco legal guatemalteco.

> ⚠ **Aviso obligatorio en toda pantalla y reporte:** _"Un indicador activado no implica irregularidad. Señala un patrón estadístico que puede tener explicaciones legítimas y que amerita revisión."_

## 10.2 Indicadores

| Código | Indicador | Fase | Lógica | Parámetros iniciales |
|---|---|---|---|---|
| **IR-01** | Oferente único | Adjudicación | Proceso competitivo (cotización o licitación) con una sola oferta recibida | `numero_ofertas = 1` |
| **IR-02** | Concentración proveedor-entidad | Adjudicación | Un proveedor recibe un porcentaje alto del monto adjudicado por una entidad en un año | ≥ 40 % del monto anual de la entidad en esa categoría |
| **IR-03** | Plazo corto de ofertas | Publicación | Días entre publicación y cierre muy por debajo de la mediana de la modalidad | < percentil 10 de la modalidad |
| **IR-04** | Posible fraccionamiento | Planificación | Varias compras directas o de baja cuantía al mismo proveedor, misma entidad y categoría, en un periodo corto, que juntas superan el umbral de la modalidad siguiente | ≥ 3 compras en 90 días con suma > umbral |
| **IR-05** | Proveedor nuevo con contrato grande | Adjudicación | Proveedor con inscripción reciente que gana un contrato de monto alto | Inscripción < 6 meses y monto > percentil 90 de la categoría |
| **IR-06** | Adjudicación muy cercana al estimado | Adjudicación | Monto adjudicado casi idéntico al estimado en procesos competitivos | Diferencia < 0.5 % |
| **IR-07** | Precio por encima de referencia | Adjudicación | Precio unitario superior al precio de referencia publicado | > 30 % sobre la referencia |
| **IR-08** | Alta tasa de concursos desiertos | Entidad | Entidad con proporción alta de procesos desiertos seguidos de compra directa | > percentil 90 entre entidades |

**Implementación (ADR-0007).** Se implementan seis indicadores: IR-01, IR-02, IR-03, IR-04, IR-05 e IR-08, sobre los procesos adjudicados (RN-07). El objetivo OE5 pide un mínimo de 5. Los ajustes respecto a la tabla anterior salieron de los datos reales:

| Código | Ajuste | Motivo |
|---|---|---|
| IR-02 | Por entidad, año y categoría OCDS (bienes, servicios, obras), con al menos Q900,000 adjudicados y 3 procesos. Excluye convenios, donaciones, arrendamientos, casos de excepción y proveedor único. | Evitar porcentajes altos en entidades con pocas compras o en compras que por ley tienen un solo proveedor. |
| IR-03 | Percentil 10 del plazo (inicio y fin de `tenderPeriod`) por modalidad, con al menos 30 procesos de esa modalidad. | Comparar contra procesos iguales. |
| IR-04 | Por **unidad compradora** (no la entidad completa), proveedor y producto (clase UNSPSC de 8 dígitos), **el mismo día** (hora de Guatemala). Cuenta 3 o más compras directas cuya suma supera el monto máximo de la compra directa (Q90,000). | La mediana de una compra directa es Q63,000. Con la regla original (entidad, 90 días) quedaban marcadas 9 de cada 10 compras directas, porque las entidades grandes compran lo mismo al mismo proveedor cada semana. Con la regla ajustada se activa en 176 mil procesos, casi todos del IGSS. Un caso: 258 compras directas del mismo medicamento, al mismo proveedor y el mismo día, que suman Q22.4 millones. |
| IR-05 | Aproximación: primer contrato del proveedor en los datos cargados, con al menos 365 días de historia previa, y monto sobre el percentil 90 de su categoría. | OCDS no publica la fecha de inscripción en el RGAE. |
| IR-06 | No se calcula. | OCDS de Guatecompras no publica el monto estimado (`tender.value`). |
| IR-08 | Entidades con al menos 10 cotizaciones o licitaciones y una tasa de desiertos sobre el percentil 90. Se marcan sus procesos por "Adquisición Directa por Ausencia de Oferta". | Es calculable con `statusDetails` y la modalidad. |

IR-07 depende de precios de referencia que OCDS no publica y queda como trabajo futuro.

Los umbrales y pesos están en `api/src/domain/riesgos.ts` (`PARAMETROS_RIESGO`) y el cálculo, en SQL, en `api/src/ocds/riesgos.ts`. La evidencia de cada indicador se redacta como un hecho verificable. Por ejemplo: "Plazo para ofertar de 2.1 días; el 90 % de los procesos de Cotización tuvo al menos 8.0 días".

## 10.3 Ejemplo de cálculo (IR-01)

```sql
-- IR-01: procesos competitivos con un solo oferente
INSERT INTO indicador_riesgo (proceso_id, codigo, valor, evidencia, calculado_en)
SELECT p.id,
       'IR-01',
       1,
       'Proceso por ' || p.modalidad || ' con 1 oferta recibida',
       now()
FROM ocds_proceso p
WHERE p.modalidad IN ('Cotización', 'Licitación')
  AND p.numero_ofertas = 1
  AND p.estado IN ('adjudicado', 'terminado');
```

## 10.4 Puntaje compuesto

```
riesgo(proceso) = Σ (peso_indicador × activado)   normalizado a 0–100
```

| Indicador | Peso inicial |
|---|---|
| IR-01 | 20 |
| IR-02 | 20 |
| IR-03 | 15 |
| IR-04 | 20 |
| IR-05 | 15 |
| IR-08 | 10 |

Los pesos son configurables y se documentarán como supuestos en el informe.

## 10.5 Validación

1. Revisión manual de una muestra de procesos marcados por cada indicador (¿el dato que activó el indicador es correcto?).
2. Presentación de resultados agregados a una organización de transparencia o periodista de datos para retroalimentación (ver [11 · Plan](11-plan-de-proyecto.md)).
3. En el informe se presentan 3 o 4 casos ilustrativos **anonimizados o descritos como patrones**, nunca como señalamientos.
