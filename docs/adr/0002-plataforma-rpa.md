# ADR-0002 · Plataforma del robot RPA

**Estado:** Propuesta (confirmar con el catedrático) · **Fecha:** 2026-10-03

## Contexto

El robot debe automatizar un portal ASP.NET Web Forms, ejecutarse de forma desatendida en un servidor Linux, versionarse en Git y probarse automáticamente.

## Opciones

| Criterio | Playwright (TypeScript) | UiPath Community | Power Automate Desktop |
|---|---|---|---|
| Reconocido como "RPA" por el curso | Medio (RPA basado en código) | Alto | Alto |
| Ejecución desatendida en servidor | Sí, Linux/Docker | Sí, con Orchestrator en la nube (límites de licencia comunitaria) | Desatendido requiere licencia de pago |
| Costo | Gratuito | Gratuito con límites | Gratuito solo atendido |
| Versionado en Git y pruebas | Nativo | Posible, menos natural | Limitado |
| Depuración | Trazas, capturas, video | Buena | Básica |
| Curva de aprendizaje para el autor | Baja | Media | Baja |

## Decisión

Usar **Playwright con TypeScript**, con el robot **desacoplado** del resto del sistema: solo lee y escribe en la base de datos y la cola.

## Consecuencias

- ✅ Despliegue desatendido sin licencias.
- ✅ Pruebas automáticas con fixtures en CI.
- ⚠ Si el curso exige una plataforma RPA comercial, se reimplementa **solo el robot** en UiPath siguiendo la equivalencia de [08 · Diseño del bot](../08-diseno-del-bot.md#88-equivalencia-en-uipath-alternativa). El resto del sistema no cambia.
