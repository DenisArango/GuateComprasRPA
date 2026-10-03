# ADR-0001 · Combinar RPA con datos abiertos OCDS

**Estado:** Aceptada · **Fecha:** 2026-10-03

## Contexto

Guatecompras ofrece dos fuentes de información:

1. El **portal web**, con todo el detalle de cada concurso, incluidos los documentos.
2. Los **datos abiertos OCDS** (`ocds.guatecompras.gt`), estructurados y descargables en JSON, CSV y Excel desde 2020, pero sin el contenido de los documentos ni las publicaciones NPG.

Usar solo RPA para todo implicaría miles de solicitudes al portal para reconstruir información que ya está publicada de forma estructurada. Usar solo OCDS dejaría fuera los documentos, que son el centro del problema.

## Decisión

- **OCDS** para todo lo histórico y estructurado: procesos, adjudicaciones, proveedores, montos.
- **RPA** solo para lo que OCDS no cubre: concursos del día, documentos, adendas, aclaraciones y cambios.

## Consecuencias

- ✅ Menos carga sobre el portal (uso responsable).
- ✅ El robot es más pequeño y fácil de mantener.
- ✅ Demuestra el criterio de **cuándo usar RPA**: solo donde no existe una interfaz estructurada.
- ⚠ Dos fuentes que deben conciliarse por NOG.
- ⚠ El histórico depende de la frecuencia de actualización de OCDS.
