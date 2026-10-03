# 13 · Plan de pruebas y evaluación

## 13.1 Niveles de prueba

| Nivel | Qué se prueba | Herramienta | Momento |
|---|---|---|---|
| Unitarias | Cálculo de compatibilidad, normalización de requisitos, validación de esquemas, indicadores de riesgo | Vitest | Cada push (CI) |
| Integración | API + base de datos (incluida la API del robot `/robot/*`); workers + cola; ETL OCDS | Vitest + PostgreSQL en contenedor | Cada push (CI) |
| Robot (fixtures) | Flujos del robot contra páginas HTML guardadas del portal | Casos de prueba de UiPath Studio (Test Explorer) + Workflow Analyzer | Antes de cada publicación a Orchestrator |
| Robot (humo real) | Una búsqueda real con un NOG conocido | Proceso de humo en Orchestrator | Diario, antes de la captura |
| End-to-end | Del concurso capturado a la alerta recibida | Robot UiPath contra fixtures + API real; Playwright Test para el dashboard | Por fase |
| Aceptación | Casos de uso con el usuario de la empresa piloto | Guion manual | Fase 6 |

> **Fixtures:** se guardan copias HTML de páginas reales del buscador y del detalle de concursos en `bot/VigiaCaptura/Tests/Fixtures/`. Los casos de prueba abren esas copias en el navegador (`file://`), así las pruebas del robot no dependen del portal ni lo cargan con solicitudes.
>
> Las pruebas del robot no corren en GitHub Actions (requieren Windows y UiPath); se ejecutan desde Studio y su resultado se registra en el reporte de la fase.

## 13.2 Casos de prueba principales

| ID | Caso | Resultado esperado | Req. |
|---|---|---|---|
| CP-01 | Captura con 3 concursos nuevos en fixtures | 3 concursos, documentos guardados, 3 trabajos en cola | RF-CAP-02 a 05 |
| CP-02 | Captura con NOG ya existente | No se duplica | RN-01 |
| CP-03 | Documento con el mismo hash | No se vuelve a descargar | RN-02 |
| CP-04 | Selector del buscador inexistente | Error `CAMBIO_ESTRUCTURA`, captura guardada, alerta al administrador | RF-CAP-08, RNF-08 |
| CP-05 | Fallo de red en un concurso | Reintenta 3 veces, registra error, continúa con el siguiente | RF-CAP-09, RNF-06 |
| CP-06 | Adenda nueva en concurso seguido | Cambio registrado, resumen de IA, alerta inmediata | RF-CAP-06, RF-NOT-03 |
| CP-07 | Respuesta de IA con campo inválido | Reintento con errores; tras 2 fallos, `REVISION_MANUAL` | RF-IA-02, RN-06 |
| CP-08 | PDF escaneado | Se aplica OCR y se genera ficha | RF-DOC-02 |
| CP-09 | Perfil con todos los documentos | Faltantes vacío | RF-COM-03 |
| CP-10 | Concurso con cierre vencido | No aparece en resumen | RN-04 |
| CP-11 | Compatibilidad bajo el umbral | No se notifica | RN-03 |
| CP-12 | Presupuesto de IA agotado | Trabajos pospuestos, alerta al administrador | RNF-11 |
| CP-13 | IR-01 sobre datos de prueba | Solo se marcan procesos competitivos con 1 oferta | RF-RIE-01 |
| CP-14 | Usuario A consulta perfil de usuario B | Acceso denegado (403) | RNF-09 |
| CP-15 | 5 intentos de inicio de sesión fallidos | Bloqueo temporal | CU-15 |

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
| Durante (2–3 semanas) | El encargado usa solo el sistema y registra su tiempo; califica cada alerta | Hoja de registro + calificaciones en el sistema |
| Semanal | Entrevista breve de 15 minutos | Guion de entrevista |
| Al final | Encuesta de satisfacción y carta de la empresa | Encuesta SUS (System Usability Scale) + carta |

## 13.6 Criterios de aceptación final

- Todos los requerimientos con prioridad **M** implementados y probados.
- Métricas de 13.3 medidas y reportadas (cumplan o no la meta, con análisis).
- Piloto completado con evidencia (registros, calificaciones, carta).
- Demostración en vivo del flujo completo: captura → ficha → alerta → dashboard.
