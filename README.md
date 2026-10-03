# Vigía de Contrataciones

> Plataforma de **automatización robótica de procesos (RPA) con inteligencia artificial** que monitorea Guatecompras, descarga y analiza los documentos de cada concurso, y entrega cada mañana a las MiPymes proveedoras del Estado un resumen de las oportunidades que sí les sirven, con lo que necesitan para ganarlas. Como módulo complementario, detecta procesos con señales de riesgo a partir de los datos abiertos OCDS.

**Curso:** _Analisis de sistemas_ · **Universidad Mariano Gálvez de Guatemala** · Ingeniería en Sistemas
**Fecha de inicio:** octubre 2026

---

## El problema en una frase

Una MiPyme que vende al Estado dedica **1 a 2 horas diarias** a revisar Guatecompras y leer bases de 30 a 80 páginas, y aun así **pierde oportunidades** por enterarse tarde, no ver una adenda o no cumplir un requisito que se le pasó.

## La solución en una frase

Un robot que hace esa revisión por ella todos los días, una IA que lee las bases y le dice **qué piden, cuándo cierra y qué le falta**, y un historial de adjudicaciones que le dice **a cuánto se ha ganado antes**.

---

## Documentación

| # | Documento | Contenido |
|---|---|---|
| 01 | [Planteamiento del problema](docs/01-planteamiento-del-problema.md) | Contexto, problema, necesidad, proceso actual (AS-IS), justificación, objetivos, alcance |
| 02 | [Propuesta de solución](docs/02-propuesta-de-solucion.md) | Solución, proceso propuesto (TO-BE), módulos, beneficios, modelo de valor |
| 03 | [Requerimientos](docs/03-requerimientos.md) | Requerimientos funcionales, no funcionales y reglas de negocio |
| 04 | [Casos de uso](docs/04-casos-de-uso.md) | Actores, diagrama y especificación de casos de uso |
| 05 | [Arquitectura y stack](docs/05-arquitectura.md) | Stack, diagramas C4, componentes, despliegue |
| 06 | [Diagramas de procesos](docs/06-diagramas.md) | Flujos AS-IS / TO-BE, secuencia, estados, actividad |
| 07 | [Modelo de datos](docs/07-modelo-de-datos.md) | Diagrama entidad-relación y diccionario de datos |
| 08 | [Diseño del robot RPA](docs/08-diseno-del-bot.md) | Flujo del bot, manejo de excepciones, uso responsable del portal |
| 09 | [Extracción con IA](docs/09-ia-extraccion.md) | Esquema de extracción, prompts, validación, control de costos |
| 10 | [Motor de banderas rojas](docs/10-banderas-rojas.md) | Indicadores de riesgo y su cálculo |
| 11 | [Plan de proyecto](docs/11-plan-de-proyecto.md) | Fases, EDT, cronograma, entregables |
| 12 | [Gestión de riesgos](docs/12-riesgos.md) | Matriz de riesgos y mitigación |
| 13 | [Plan de pruebas y evaluación](docs/13-plan-de-pruebas.md) | Pruebas, métricas de éxito, protocolo de evaluación del piloto |
| 14 | [Glosario](docs/14-glosario.md) | Términos de contratación pública y técnicos |
| ADR | [Decisiones de arquitectura](docs/adr/) | Registro de decisiones técnicas y su justificación |

## Estructura del repositorio

```
vigia-contrataciones/
├── docs/            Documentación del proyecto
│   ├── adr/         Registro de decisiones de arquitectura
│   └── diagramas/   Diagramas exportados (PNG/SVG) para el informe
├── bot/             Robot RPA de captura en UiPath (Guatecompras)
├── api/             Backend: API, IA, banderas rojas, notificaciones
├── web/             Dashboard web
├── database/        Esquema, migraciones y scripts de carga OCDS
└── infra/           Docker, variables de entorno, despliegue
```

## Estado

| Fase | Estado |
|---|---|
| 0. Documentación inicial | ✅ En revisión |
| 1. Levantamiento AS-IS con empresa piloto | ⏳ Pendiente |
| 2. Carga OCDS y banderas rojas | ⏳ Pendiente |
| 3. Robot de captura | ⏳ Pendiente |
| 4. Extracción con IA y compatibilidad | ⏳ Pendiente |
| 5. Dashboard y alertas | ⏳ Pendiente |
| 6. Piloto y evaluación | ⏳ Pendiente |

> Los diagramas están escritos en **Mermaid**; GitHub y GitLab los muestran directamente. Para el informe impreso se pueden exportar a PNG con [mermaid.live](https://mermaid.live) y guardarlos en `docs/diagramas/`.
