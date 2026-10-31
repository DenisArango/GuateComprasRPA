# ADR-0003 · Base de datos PostgreSQL

**Estado:** Aceptada · **Fecha:** 2026-10-03

## Contexto

El sistema necesita guardar datos relacionales (concursos, perfiles), documentos OCDS semiestructurados, texto completo de PDF para búsqueda, vectores para similitud semántica y una cola de trabajos.

## Opciones

SQL Server, PostgreSQL, MySQL.

## Decisión

**PostgreSQL 16**, porque cubre todo en un solo motor:

- `jsonb` para los registros OCDS originales y las fichas de IA.
- Búsqueda de texto completo en español (`to_tsvector('spanish', ...)`).
- Extensión `pgvector` para embeddings.
- ~~`pg-boss` para la cola de trabajos y la programación~~. Desde [ADR-0004](0004-uipath-como-centro.md), la cola y la programación las maneja Orchestrator.
- Gratuito y disponible en Docker y en cualquier proveedor de nube.

## Consecuencias

- ✅ Menos componentes de infraestructura.
- ✅ Sin costo de licencias.
- ⚠ Si se requiriera integración con un entorno SQL Server existente, Prisma permite cambiar el proveedor con ajustes en los tipos específicos (`jsonb`, vectores).
