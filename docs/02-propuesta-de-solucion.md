# 02 · Propuesta de solución

## 2.1 Descripción general

**Vigía de Contrataciones** es una plataforma que combina tres capacidades:

1. **Robot RPA** que navega Guatecompras como lo haría una persona: busca concursos nuevos, entra a cada uno, descarga los documentos y detecta cambios.
2. **Inteligencia artificial** que lee las bases y produce una ficha estructurada: qué se compra, monto, fechas, requisitos, garantías y criterios de calificación.
3. **Inteligencia de datos** construida con los datos abiertos OCDS: quién ha ganado concursos similares, a qué precio, y qué procesos presentan señales de riesgo.

El resultado para el usuario es un **resumen diario** con las oportunidades que le aplican, qué le falta para participar y referencias de precio.

### Ejemplo de alerta diaria

```text
🟢 Vigía de Contrataciones · viernes 16 de octubre

3 concursos nuevos para Distribuidora Médica S.A.

1) Hospital Roosevelt · Guantes de nitrilo · Q180,000 · Cotización
   Cierra: jueves 29/10, 10:00
   Compatibilidad: 92 %
   Piden: RTU, constancia RGAE, fianza de sostenimiento, carta de distribuidor autorizado
   ⚠ Te falta: carta de distribuidor autorizado
   Referencia: este hospital adjudicó guantes 2 veces en 12 meses; precio promedio por caja QX

2) ...

🔔 Cambios en concursos que sigues
   NOG 12345678 · se publicó una adenda: ahora exigen registro sanitario
```

## 2.2 Proceso propuesto (TO-BE)

| Paso | Actividad | Responsable | Tiempo |
|---|---|---|---|
| 1 | Buscar concursos nuevos según filtros del perfil | Robot (madrugada) | Automático |
| 2 | Descargar bases, anexos y adendas | Robot | Automático |
| 3 | Extraer la ficha estructurada de cada concurso | IA | Automático |
| 4 | Calcular compatibilidad con el perfil y documentos faltantes | Motor de compatibilidad | Automático |
| 5 | Agregar historial de adjudicaciones y precios | Motor OCDS | Automático |
| 6 | Enviar resumen diario y alertas de cambios | Notificador | Automático (7:00) |
| 7 | Revisar el resumen y decidir en qué participar | Encargado | 10–15 min |

El diagrama comparativo AS-IS / TO-BE está en [06 · Diagramas](06-diagramas.md).

## 2.3 Módulos

| Módulo | Responsabilidad | Tecnología principal |
|---|---|---|
| **M1 · Robot de captura** | Navegar Guatecompras, capturar concursos y documentos, detectar cambios | UiPath (Studio + Orchestrator) |
| **M2 · Procesamiento de documentos** | Extraer texto de PDF, aplicar OCR a documentos escaneados | pdf.js / Tesseract |
| **M3 · Extracción con IA** | Convertir el texto de las bases en una ficha estructurada validada | API de LLM + validación de esquema |
| **M4 · Compatibilidad** | Comparar requisitos contra el perfil de la empresa y calcular puntaje | Reglas + similitud semántica |
| **M5 · Datos abiertos OCDS** | Cargar y actualizar el histórico de procesos y adjudicaciones | ETL programado |
| **M6 · Banderas rojas** | Calcular indicadores de riesgo sobre el histórico | Consultas SQL |
| **M7 · Notificaciones** | Enviar resumen diario y alertas inmediatas | Correo SMTP, bot de Telegram |
| **M8 · Dashboard web** | Consulta de concursos, fichas, perfil, historial y riesgos | Aplicación web |
| **M9 · Orquestación y monitoreo** | Programar ejecuciones, reintentos, bitácora y alertas de fallo | Planificador + cola de trabajos |

## 2.4 ¿Por qué RPA y no solo datos abiertos?

| Necesidad | ¿Está en OCDS? | Cómo se obtiene |
|---|---|---|
| Datos generales del concurso | Sí, con desfase | OCDS para el histórico; robot para lo del día |
| Bases, especificaciones y anexos (PDF) | No | **Robot** |
| Aclaraciones y adendas | Parcial / sin contenido | **Robot** |
| Adjudicaciones históricas | Sí | OCDS |
| Compras sin concurso (NPG) | No | Robot (trabajo futuro) |

La decisión completa está en [ADR-0001](adr/0001-rpa-y-datos-abiertos.md).

## 2.5 Beneficios esperados

| Beneficio | Para quién | Cómo se mide |
|---|---|---|
| Ahorro de tiempo de revisión | MiPyme | Minutos diarios antes vs después |
| Más concursos evaluados | MiPyme | Concursos revisados por semana |
| Menos descalificaciones por requisitos | MiPyme | Seguimiento cualitativo durante el piloto |
| Mejor fijación de precios | MiPyme | Disponibilidad de referencia de precio por concurso |
| Detección de procesos con señales de riesgo | Sociedad civil | Casos identificados y validados por expertos |

## 2.6 Modelo de valor (cómo se ofrece)

**Propuesta de valor:** *"Deja de buscar en Guatecompras. Cada mañana recibes las oportunidades que te sirven, lo que piden y lo que te falta."*

| Elemento | Propuesta |
|---|---|
| Cliente | MiPymes proveedoras del Estado y gestores de licitaciones |
| Canal | Contacto directo con proveedores identificados en los datos OCDS; gremios y cámaras empresariales |
| Modelo | Suscripción mensual por perfil de empresa; plan gratuito limitado a una categoría |
| Diferenciador | Lectura de las bases con IA, detección de faltantes y referencia de precios históricos |
| Módulo social | Indicadores de riesgo abiertos para organizaciones de transparencia y academia |

> Para efectos del curso, el sistema se implementa como **piloto** con una empresa real. El modelo de negocio se documenta como viabilidad, no como objetivo del proyecto.

## 2.7 Uso ético y responsable

- El robot consulta **solo información pública**, sin credenciales de usuario en Guatecompras.
- Se limita la frecuencia de consultas y se ejecuta en horario de baja demanda (ver [08 · Diseño del bot](08-diseno-del-bot.md#87-uso-responsable-del-portal)).
- Los indicadores de riesgo se presentan como **señales que ameritan revisión**, nunca como acusaciones de irregularidad.
- La información de la empresa piloto se trata como confidencial y se anonimiza en el informe.
