# 12 · Gestión de riesgos

**Probabilidad (P)** e **impacto (I)** en escala 1–3. **Exposición = P × I**.

| ID | Riesgo | P | I | Exp. | Mitigación | Contingencia |
|---|---|---|---|---|---|---|
| R-01 | No conseguir empresa piloto a tiempo | 2 | 3 | 6 | Empezar la búsqueda en la semana 1 con lista de candidatos desde OCDS; varias vías de contacto | Piloto con un gestor de licitaciones o con un perfil simulado basado en un proveedor real, documentando la limitación |
| R-02 | Guatecompras cambia su estructura HTML | 2 | 2 | 4 | Selectores centralizados; pruebas de humo diarias; alertas `CAMBIO_ESTRUCTURA` | Ajustar el Object Repository; republicar y relanzar captura manual |
| R-03 | El portal bloquea o limita al robot | 1 | 3 | 3 | Uso responsable: pausas, horario nocturno, una sola sesión | Reducir frecuencia; contactar al MINFIN; usar OCDS para lo estructurado |
| R-04 | Baja exactitud de la IA en algunas bases | 2 | 2 | 4 | Validación con esquema, reintentos, referencias de página, revisión manual | Marcar `REVISION_MANUAL`; ajustar prompts con ejemplos reales |
| R-05 | PDFs escaneados de mala calidad | 2 | 2 | 4 | OCR con preprocesamiento (escala de grises, binarización) | Notificar con datos básicos y enlace al documento |
| R-06 | Costo de IA mayor al previsto | 1 | 2 | 2 | Reducción de contexto, presupuesto diario, deduplicación por hash | Bajar a modelo más económico; limitar categorías |
| R-07 | Datos OCDS incompletos o con errores | 2 | 2 | 4 | Revisar cobertura y problemas de calidad publicados del conjunto | Documentar limitaciones; excluir campos poco confiables de los indicadores |
| R-08 | Mala interpretación de banderas rojas como acusaciones | 1 | 3 | 3 | Aviso obligatorio, lenguaje neutral, casos anonimizados | Retirar casos específicos del informe público |
| R-09 | Robot UiPath no disponible a la hora de captura (equipo Windows apagado, límites de la licencia Community/Free) | 2 | 2 | 4 | Equipo o VM Windows dedicado con encendido programado; verificar límites de licencia al iniciar la fase 3; alerta si no hay ejecución a las 03:00 ([ADR-0002](adr/0002-plataforma-rpa.md)) | Ejecutar el proceso manualmente desde Orchestrator o Studio; el resumen se envía con lo capturado |
| R-10 | Falta de tiempo por carga laboral y académica | 3 | 2 | 6 | Alcance acotado (1–2 categorías); prioridades MoSCoW; demostraciones por fase | Recortar requerimientos S y C; mantener todos los M |
| R-11 | Pérdida de datos o del código | 1 | 3 | 3 | Git con repositorio remoto; respaldos diarios de PostgreSQL | Restaurar último respaldo |
| R-12 | Cambios en la Ley de Contrataciones o en montos | 1 | 1 | 1 | Umbrales parametrizados (RN-08) | Actualizar configuración |

## Mapa de calor

| P \ I | 1 · Bajo | 2 · Medio | 3 · Alto |
|---|---|---|---|
| **3 · Alta** | | R-10 | |
| **2 · Media** | | R-02, R-04, R-05, R-07, R-09 | R-01 |
| **1 · Baja** | R-12 | R-06 | R-03, R-08, R-11 |

**Prioridad de atención:** R-01 y R-10 (exposición 6).
