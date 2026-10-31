# ADR-0004 · UiPath como centro de la automatización

**Estado:** Aceptada · **Fecha:** 2026-10-30 · **Reemplaza a:** [ADR-0002](0002-plataforma-rpa.md)

## Contexto

El curso evalúa principalmente el componente RPA y exige **UiPath**. No se exige que todo el sistema sea UiPath, pero la automatización debe ser el centro del proyecto, no un componente secundario de una aplicación web.

El diseño anterior (ADR-0002) tenía un robot en Playwright que solo capturaba, y el resto del trabajo (texto, IA, notificaciones, programación) lo hacían *workers* en Node con pg-boss. Con ese diseño, el RPA quedaba en segundo plano.

Se cuenta con UiPath Studio 2026.0 (STS) y una organización en **Automation Cloud** con Orchestrator, licencia que permite 2 robots desatendidos y 2 de pruebas.

## Decisión

1. **Todos los procesos automáticos son procesos UiPath**, publicados y programados en **Orchestrator**:

   | Proceso | Tipo | Responsabilidad |
   |---|---|---|
   | `VC.Captura` | Despachador | Buscar concursos nuevos y en seguimiento; agregar elementos a la cola `VC_Concursos` |
   | `VC.Concurso` | Ejecutor (REFramework) | Leer el detalle de cada NOG, descargar documentos, detectar cambios |
   | `VC.Analisis` | Ejecutor (REFramework) + Action Center | Extraer texto/OCR, obtener la ficha con IA, validación humana cuando hace falta |
   | `VC.Notificador` | Ejecutor | Resumen diario, alertas inmediatas, recordatorios |
   | `VC.Expediente` | Atendido | Armar el expediente de oferta de un concurso |
   | `VC.Datos` | Programado | Orquestar la actualización OCDS y el recálculo de banderas rojas |
   | `VC.Comun` | Biblioteca | Object Repository de Guatecompras, cliente de la API, utilidades |

2. **Orchestrator es el único planificador y la cola de trabajo**: triggers de tiempo y de cola, colas, assets, credenciales, logs y alertas. Se elimina pg-boss.
3. **Solo `VC.Concurso` y `VC.Captura` navegan Guatecompras.** Las reglas de uso responsable se mantienen.
4. **Los robots no acceden directo a la base de datos.** Leen y escriben a través de la **API REST** (Fastify), autenticados con una clave guardada como *credential asset*.
5. **Las reglas de dominio viven en la API**: esquema de la ficha (Zod), cálculo de compatibilidad, faltantes, presupuesto de IA, banderas rojas. Así hay una sola implementación compartida entre los robots y el dashboard.
6. **Formato de los flujos** (el catedrático acepta coded workflows): XAML para la estructura (REFramework), la interacción con el portal y las actividades nativas (colas, correo, Action Center). **Coded workflows (C#)** para transformaciones: normalizar datos del portal, hashes, segmentar texto, cliente HTTP.
7. **Se mantienen fuera de UiPath:** API (Fastify + Prisma), dashboard (Angular), PostgreSQL y el ETL de OCDS (Node). Corren en Docker Compose.

## Opciones descartadas

| Opción | Motivo |
|---|---|
| Solo reemplazar el robot de Playwright por UiPath (equivalencia del ADR-0002) | El RPA seguiría siendo una parte menor del sistema |
| Todo en UiPath, incluidos dashboard (UiPath Apps) y base de datos (Data Service) | Más dependencia de la licencia; el autor domina Angular y PostgreSQL; el ETL de OCDS y las consultas de riesgo no son tareas de RPA |
| Robots con acceso directo a PostgreSQL | Duplicaría las reglas de dominio en C# y expondría credenciales de la BD en la máquina del robot |

## Consecuencias

- ✅ El RPA ocupa el centro del proyecto y aprovecha la plataforma: REFramework, despachador/ejecutor, colas, triggers, assets, Action Center, Object Repository y bibliotecas.
- ✅ Métricas de RPA disponibles de forma nativa: tiempo por transacción, reintentos, excepciones de negocio frente a excepciones de sistema.
- ✅ El dashboard puede encolar trabajo (captura manual de un NOG) por la API de Orchestrator.
- ⚠ Los robots necesitan una **máquina Windows**; no corren en el contenedor Linux. Ver R-13 en [12 · Riesgos](../12-riesgos.md).
- ⚠ Dependencia de la licencia de Automation Cloud (prueba → Community). Ver R-14.
- ⚠ La disponibilidad de Action Center y de unidades de IA depende de la licencia. Si no hay, la revisión manual se hace en el dashboard.
- ⚠ Los flujos XAML se revisan en Git con más dificultad que el código. Por eso la lógica de transformación va en C#.
