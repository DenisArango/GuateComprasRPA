# Registro de decisiones de arquitectura (ADR)

Cada decisión técnica relevante se documenta en un archivo con: contexto, opciones, decisión y consecuencias.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-rpa-y-datos-abiertos.md) | Combinar RPA con datos abiertos OCDS | Aceptada |
| [0002](0002-plataforma-rpa.md) | Playwright como plataforma del robot | Reemplazada por 0004 |
| [0003](0003-base-de-datos.md) | PostgreSQL como base de datos | Aceptada |
| [0004](0004-uipath-como-centro.md) | UiPath como centro de la automatización | Aceptada |
| [0005](0005-ia-claude.md) | Claude (`claude-opus-5-5`) como servicio de IA | Aceptada |
| [0006](0006-boletin-y-robot-atendido.md) | Boletín diario y robot atendido para documentos (captcha del portal) | Aceptada |
| [0007](0007-fuente-ocds.md) | Datos OCDS desde el OCP Data Registry; indicadores ajustados a los datos disponibles | Aceptada |
| [0008](0008-automatizar-pasos-atendidos.md) | `VC.Concurso` por disparador en la sesión abierta y `VC.Expediente` automático al marcar Participaré | Aceptada |

Para una nueva decisión, copiar el formato y numerar consecutivamente.
