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

**Para el proyecto se implementan IR-01 a IR-06** (objetivo OE5: mínimo 5). IR-07 depende de la disponibilidad y formato de los precios de referencia; IR-08 y la versión completa de IR-04 (con publicaciones NPG) quedan como trabajo futuro.

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
| IR-06 | 10 |

Los pesos son configurables y se documentarán como supuestos en el informe.

## 10.5 Validación

1. Revisión manual de una muestra de procesos marcados por cada indicador (¿el dato que activó el indicador es correcto?).
2. Presentación de resultados agregados a una organización de transparencia o periodista de datos para retroalimentación (ver [11 · Plan](11-plan-de-proyecto.md)).
3. En el informe se presentan 3 o 4 casos ilustrativos **anonimizados o descritos como patrones**, nunca como señalamientos.
