# Contexto del proyecto para Claude

## Qué es

**Vigía de Contrataciones**: proyecto universitario (Ingeniería en Sistemas, UMG) de RPA + IA. Un robot captura a diario concursos y documentos de Guatecompras, una IA extrae una ficha estructurada de las bases, y el sistema notifica a MiPymes proveedoras del Estado las oportunidades compatibles, con documentos faltantes y referencias de precio (datos abiertos OCDS). Módulo complementario: banderas rojas de riesgo sobre el histórico OCDS.

La documentación completa está en `docs/`. Antes de implementar algo, leer el documento relevante:
- Requerimientos y reglas de negocio: `docs/03-requerimientos.md`
- Casos de uso: `docs/04-casos-de-uso.md`
- Arquitectura y estructura del monorepo: `docs/05-arquitectura.md`
- Modelo de datos: `docs/07-modelo-de-datos.md`
- Robot: `docs/08-diseno-del-bot.md` · IA: `docs/09-ia-extraccion.md` · Riesgos: `docs/10-banderas-rojas.md`
- Plan y fases: `docs/11-plan-de-proyecto.md`

## Stack

Robot: **UiPath** (Studio + REFramework, expresiones C#, robot desatendido en Windows, Orchestrator en Automation Cloud), confirmado por el catedrático; ver `docs/adr/0002-plataforma-rpa.md`. Resto del sistema en TypeScript. API: Node + Fastify + Prisma (incluye la API del robot `/robot/*`). BD: PostgreSQL 16 + pgvector. Cola y cron de workers: pg-boss. Validación: Zod (esquemas compartidos). Frontend: Angular + Angular Material. Notificaciones: Nodemailer + bot de Telegram. Infra: Docker Compose (todo menos el robot). Pruebas: Vitest, casos de prueba de UiPath Studio y Playwright Test (e2e del dashboard).

## Reglas del proyecto

- El robot **solo captura** y entrega los datos a la API del robot; no llama a la IA, no envía notificaciones ni accede directamente a PostgreSQL (robot desacoplado).
- Todos los selectores del portal van en el Object Repository del proyecto UiPath (`bot/VigiaCaptura/.objects/`).
- Uso responsable del portal: 1 navegador, pausas de 2–3 s, horario nocturno, solo información pública.
- Datos históricos desde OCDS, nunca con el robot (`docs/adr/0001-rpa-y-datos-abiertos.md`).
- Umbrales de modalidad y pesos de puntajes parametrizados, no codificados.
- Secretos solo en `.env` (existe `infra/.env.example`) y, para el robot, en Credential Assets de Orchestrator.
- Indicadores de riesgo siempre con el aviso de que son señales, no acusaciones.
- Al cambiar una decisión de diseño, actualizar el documento correspondiente en `docs/` o crear un ADR.

## Sobre el autor

Desarrollador full-stack con experiencia en TypeScript, Node, Fastify, Prisma y Angular. Conoce poco de HTML y CSS: en esa parte, solo comentarios puntuales, sin explicar cada regla. Prefiere respuestas directas y concisas, en español.

## Estado actual

- Fase 0 (documentación): completa.
- Siguiente: fase 2, infraestructura base (Docker Compose, PostgreSQL, Prisma) y ETL OCDS.
- Plataforma RPA confirmada: UiPath.
- Pendiente: conseguir empresa piloto; ajustar fechas del Gantt; verificar límites de la licencia UiPath Community/Free.
