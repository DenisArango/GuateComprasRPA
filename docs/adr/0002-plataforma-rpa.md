# ADR-0002 · Plataforma del robot RPA

**Estado:** Aceptada · **Fecha:** 2026-10-03

## Contexto

El robot debe automatizar un portal ASP.NET Web Forms y ejecutarse de forma desatendida cada madrugada. El curso trata sobre RPA con **UiPath**, y el catedrático confirmó que el robot debe construirse en esa plataforma.

La propuesta inicial era Playwright con TypeScript; se descarta por el requisito del curso.

## Opciones

| Criterio | UiPath (Studio + Orchestrator) | Playwright (TypeScript) | Power Automate Desktop |
|---|---|---|---|
| Exigido por el curso | **Sí** | No | No |
| Ejecución desatendida | Sí, robot desatendido conectado a Orchestrator (Automation Cloud, plan Community/Free) | Sí, Linux/Docker | Requiere licencia de pago |
| Programación y colas | Triggers y Queues de Orchestrator | Requiere implementarlo (pg-boss) | Limitado |
| Manejo de excepciones | REFramework (System / Business Exception) | Manual | Básico |
| Sistema operativo del robot | Windows | Linux / Windows | Windows |
| Versionado en Git | Sí (integración Git de Studio) | Nativo | Limitado |

## Decisión

Construir el robot en **UiPath Studio** con la plantilla **REFramework**, ejecutado por un **robot desatendido** administrado desde **UiPath Orchestrator** (Automation Cloud).

El robot sigue **desacoplado** del resto del sistema: **no accede directamente a PostgreSQL**; se comunica con el sistema solo mediante la **API REST del robot** (`/robot/*`), autenticado con una clave de API. La API registra los datos, guarda los archivos y encola los trabajos de pg-boss.

## Consecuencias

- ✅ Cumple el requisito del curso y usa los conceptos que se evalúan (REFramework, Queues, Transaction Items, Object Repository, Orchestrator).
- ✅ Reintentos, programación y bitácora de ejecución nativos de Orchestrator.
- ✅ El resto del sistema (API, workers, IA, notificaciones, dashboard) se mantiene en TypeScript sin cambios de diseño.
- ⚠ El robot requiere un **equipo Windows** encendido a la hora de captura (PC propia o máquina virtual); no corre dentro de Docker Compose.
- ⚠ Límites de la licencia Community/Free (robots desatendidos, minutos, retención de logs): verificar los vigentes al iniciar la fase 3.
- ⚠ Las pruebas del robot no corren en GitHub Actions; se ejecutan con los casos de prueba de UiPath Studio (ver [13 · Pruebas](../13-plan-de-pruebas.md)).
- ⚠ Hay que exponer y proteger la API del robot (clave de API, HTTPS).
