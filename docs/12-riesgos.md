# 12 · Gestión de riesgos

**Probabilidad (P)** e **impacto (I)** en escala 1–3. **Exposición = P × I**.

| ID | Riesgo | P | I | Exp. | Mitigación | Contingencia |
|---|---|---|---|---|---|---|
| R-01 | No conseguir empresa piloto a tiempo | 2 | 3 | 6 | Empezar la búsqueda en la semana 1 con lista de candidatos desde OCDS; varias vías de contacto | Piloto con un gestor de licitaciones o con un perfil simulado basado en un proveedor real, documentando la limitación |
| R-02 | Guatecompras cambia su estructura HTML | 2 | 2 | 4 | Selectores centralizados; pruebas de humo diarias; alertas `CAMBIO_ESTRUCTURA` | Corregir el descriptor en el Object Repository de `VC.Comun`, publicar la biblioteca y relanzar la captura |
| R-03 | El portal bloquea o limita al robot (ya usa Cloudflare Turnstile en búsqueda y detalle) | 1 | 3 | 3 | Uso responsable: pausas, horario nocturno, una sola sesión | Reducir frecuencia; contactar al MINFIN; usar OCDS para lo estructurado |
| R-04 | Baja exactitud de la IA en algunas bases | 2 | 2 | 4 | Validación con esquema, reintentos, referencias de página, revisión manual | Marcar `REVISION_MANUAL`; ajustar prompts con ejemplos reales |
| R-05 | PDFs escaneados de mala calidad | 2 | 2 | 4 | OCR con preprocesamiento (escala de grises, binarización) | Notificar con datos básicos y enlace al documento |
| R-06 | Costo de IA mayor al previsto | 1 | 2 | 2 | Reducción de contexto, presupuesto diario, deduplicación por hash | Bajar a modelo más económico; limitar categorías |
| R-07 | Datos OCDS incompletos o con errores | 2 | 2 | 4 | Revisar cobertura y problemas de calidad publicados del conjunto | Documentar limitaciones; excluir campos poco confiables de los indicadores |
| R-08 | Mala interpretación de banderas rojas como acusaciones | 1 | 3 | 3 | Aviso obligatorio, lenguaje neutral, casos anonimizados | Retirar casos específicos del informe público |
| R-09 | ~~El catedrático exige plataforma RPA comercial~~ | — | — | — | **Cerrado:** confirmado UiPath, ver [ADR-0004](adr/0004-uipath-como-centro.md) | — |
| R-10 | Falta de tiempo por carga laboral y académica | 3 | 2 | 6 | Alcance acotado (1–2 categorías); prioridades MoSCoW; demostraciones por fase | Recortar requerimientos S y C; mantener todos los M |
| R-11 | Pérdida de datos o del código | 1 | 3 | 3 | Git con repositorio remoto; respaldos diarios de PostgreSQL | Restaurar último respaldo |
| R-12 | Cambios en la Ley de Contrataciones o en montos | 1 | 1 | 1 | Umbrales parametrizados (RN-08) | Actualizar configuración |
| R-13 | La máquina de los robots no permite ejecución desatendida estable (Windows Home, equipo apagado o con sesión bloqueada) | 1 | 3 | 3 | Los procesos desatendidos son de segundo plano (sin interfaz, no requieren sesión interactiva); configurar energía para que el equipo no se suspenda | Usar una máquina o VM con Windows Pro/Server, o ejecutar en modo atendido con triggers mientras el equipo está encendido |
| R-14 | Vence la licencia de prueba de Automation Cloud | 2 | 2 | 4 | Revisar la fecha en Admin → Licenses; exportar paquetes y configuración de Orchestrator | Pasar a la organización Community y volver a crear colas, assets y triggers con el script de configuración |
| R-15 | La licencia no incluye Action Center o unidades de IA suficientes | 2 | 1 | 2 | Verificar al configurar Orchestrator | Revisión manual desde el dashboard (CU-17, flujo alterno) |
| R-16 | Nadie inicia el robot atendido en la mañana, o la persona no tiene licencia de Assistant | 2 | 2 | 4 | Trigger de Assistant a las 07:30; aviso en el resumen preliminar; verificar licencia de usuario | El administrador ejecuta `VC.Concurso` en su equipo |
| R-17 | El portal OCDS rechaza clientes que no son navegador (Cloudflare) | 2 | 2 | 4 | Usar las descargas masivas publicadas o el registro de datos de Open Contracting Partnership | Descarga manual semanal de los archivos y carga con el ETL |
| R-18 | Cambia la URL o el formato del boletín diario | 1 | 3 | 3 | Parser con pruebas sobre boletines guardados; alerta `CAMBIO_ESTRUCTURA` | Ajustar `LeerBoletin`; mientras tanto, NOG manuales desde el dashboard |

## Mapa de calor

| P \ I | 1 · Bajo | 2 · Medio | 3 · Alto |
|---|---|---|---|
| **3 · Alta** | | R-10 | |
| **2 · Media** | R-15 | R-02, R-04, R-05, R-07, R-14, R-16, R-17 | R-01 |
| **1 · Baja** | R-12 | R-06 | R-03, R-08, R-11, R-13, R-18 |

**Prioridad de atención:** R-01 y R-10 (exposición 6).
