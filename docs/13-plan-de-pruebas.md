# 13 · Plan de pruebas y evaluación

## 13.1 Niveles de prueba

| Nivel | Qué se prueba | Herramienta | Momento |
|---|---|---|---|
| Unitarias | Cálculo de compatibilidad, normalización de requisitos, validación de esquemas, indicadores de riesgo | Vitest | Cada push (CI) |
| Integración | API + base de datos; rutas `/robot/*`; ETL OCDS | Vitest + PostgreSQL en contenedor | Cada push (CI) |
| Robots (fixtures) | Flujos de los robots contra páginas HTML guardadas del portal; coded workflows de transformación | Casos de prueba de UiPath Studio (Test Suite) | Antes de publicar cada versión |
| Robots (humo real) | Una búsqueda real con un NOG conocido | Caso de prueba de UiPath ejecutado desde Orchestrator | Diario, antes de la captura |
| End-to-end | Del concurso capturado a la alerta recibida | Ejecución completa en Orchestrator + verificación en la API | Por fase |
| Dashboard | Flujos principales de la interfaz | Playwright Test | Cada push (CI) |
| Aceptación | Casos de uso con el usuario de la empresa piloto | Guion manual | Fase 6 |

> **Fixtures:** se guardan copias de boletines diarios reales y de páginas de detalle de concursos en `rpa/fixtures/`. Los casos de prueba abren esas copias en el navegador, así no dependen del portal ni lo cargan con solicitudes.

## 13.2 Casos de prueba principales

| ID | Caso | Resultado esperado | Req. |
|---|---|---|---|
| CP-01 | Boletín guardado con 3 concursos compatibles con el perfil de prueba | 3 elementos en `VC_Concursos`; al procesarlos, 3 concursos con documentos y 3 elementos en `VC_Analisis` | RF-CAP-02 a 05, RF-CAP-11 |
| CP-02 | Captura con NOG ya existente | No se duplica | RN-01 |
| CP-03 | Documento con el mismo hash | No se vuelve a descargar | RN-02 |
| CP-04 | Boletín con formato distinto o selector del detalle inexistente | Error `CAMBIO_ESTRUCTURA`, captura guardada, alerta al administrador | RF-CAP-08, RNF-08 |
| CP-05 | Fallo de red en un concurso | System Exception; Orchestrator reintenta el elemento; tras agotar reintentos queda fallido y el robot continúa con el siguiente | RF-CAP-09, RNF-06 |
| CP-06 | Adenda nueva en concurso seguido | Cambio registrado, resumen de IA, alerta inmediata | RF-CAP-06, RF-NOT-03 |
| CP-07 | Respuesta de IA con campo inválido | Reintento con errores; tras 2 fallos, tarea en Action Center y `REVISION_MANUAL` | RF-IA-02, RF-IA-07, RN-06 |
| CP-08 | PDF escaneado | Se aplica OCR y se genera ficha | RF-DOC-02 |
| CP-09 | Perfil con todos los documentos | Faltantes vacío | RF-COM-03 |
| CP-10 | Concurso con cierre vencido | No aparece en resumen | RN-04 |
| CP-11 | Compatibilidad bajo el umbral | No se notifica | RN-03 |
| CP-12 | Presupuesto de IA agotado | Elementos pospuestos al día siguiente, alerta al administrador | RNF-11 |
| CP-13 | IR-01 sobre datos de prueba | Solo se marcan procesos competitivos con 1 oferta | RF-RIE-01 |
| CP-14 | Usuario A consulta perfil de usuario B | Acceso denegado (403) | RNF-09 |
| CP-15 | 5 intentos de inicio de sesión fallidos | Bloqueo temporal | CU-15 |
| CP-16 | Ficha con fecha distinta a la del portal | Confianza bajo el umbral; tarea en Action Center; al completarla, ficha `validada_por = HUMANO` | RF-IA-07 |
| CP-17 | Expediente con un documento vencido | Checklist marca `VENCIDO`; el documento no se copia | RF-EXP-02 |
| CP-18 | NOG manual desde el dashboard | Elemento `MANUAL` en `VC_Concursos` y concurso capturado | RF-CAP-07 |
| CP-19 | Aparece la verificación de Cloudflare en el detalle | El robot se detiene y avisa a la persona; al resolverla, continúa. No hay ningún intento automático de resolverla. | RF-CAP-12, RN-11 |
| CP-20 | Parser del boletín sobre 5 boletines reales guardados | Mismo número de concursos que indica el encabezado ("Se publicaron N concursos"), sin NOG duplicados | RF-CAP-02 |

## 13.3 Métricas de éxito del proyecto

| Métrica | Fórmula | Meta | Objetivo |
|---|---|---|---|
| Tasa de éxito del robot | ejecuciones exitosas o parciales / ejecuciones totales | ≥ 95 % | OE1 |
| Cobertura de captura | concursos capturados / concursos que existían en el portal con esos filtros (verificación manual en 5 días) | ≥ 98 % | OE1 |
| Exactitud de extracción | campos correctos / campos evaluados | ≥ 85 % | OE2 |
| Precisión de alertas | alertas calificadas relevantes / alertas calificadas | ≥ 80 % | OE3 |
| Reducción de tiempo | (tiempo AS-IS − tiempo TO-BE) / tiempo AS-IS | ≥ 70 % | OE6 |
| Detección de cambios | adendas detectadas / adendas publicadas en concursos seguidos | 100 % | OE1 |
| Costo de IA | USD por concurso analizado | Reportar | RNF-11 |
| Latencia | Hora de envío del resumen | ≤ 07:00 | RNF-02 |
| Tiempo por transacción | Promedio de procesamiento por elemento en `VC_Concursos` y `VC_Analisis` (datos de Orchestrator) | Reportar | OE1 |
| Excepciones | Business Rule vs System Exception por proceso | Reportar | OE1 |
| Tasa de validación humana | fichas validadas por humano / fichas generadas | Reportar | OE2 |
| Tiempo de expediente | (tiempo manual − tiempo con robot) / tiempo manual | ≥ 50 % | OE7 |
| Retorno de la automatización | horas ahorradas al mes × costo por hora del encargado | Reportar en Q | OE6 |

## 13.4 Evaluación de la extracción con IA

1. Seleccionar **30–50 concursos** de distintas entidades y modalidades.
2. Una persona llena manualmente la ficha de cada uno (preferiblemente alguien de la empresa piloto o el autor con verificación cruzada).
3. Comparar campo por campo contra la ficha de la IA:

| Tipo de campo | Criterio de "correcto" |
|---|---|
| Fecha, monto | Valor exacto |
| Texto (objeto, plazo, lugar) | Mismo significado |
| Listas (requisitos, garantías, criterios) | Precisión y exhaustividad por elemento (*precision* y *recall*) |

4. Reportar exactitud por campo, matriz de errores y ejemplos de fallos.

## 13.5 Protocolo del piloto

| Momento | Actividad | Instrumento |
|---|---|---|
| Antes (5 días hábiles) | El encargado registra el tiempo diario que dedica a Guatecompras y cuántos concursos revisa | Hoja de registro diaria |
| Durante (5 días) | El encargado usa solo el sistema y registra su tiempo; califica cada alerta | Hoja de registro + calificaciones en el sistema |
| Al tercer día y al final | Entrevista breve de 15 minutos | Guion de entrevista |
| Al final | Encuesta de satisfacción y carta de la empresa | Encuesta SUS (System Usability Scale) + carta |

## 13.6 Criterios de aceptación final

- Todos los requerimientos con prioridad **M** implementados y probados.
- Métricas de 13.3 medidas y reportadas (cumplan o no la meta, con análisis).
- Piloto completado con evidencia (registros, calificaciones, carta).
- Demostración en vivo del flujo completo en Orchestrator: captura → cola → ficha (con una validación en Action Center) → alerta → dashboard → expediente.
