# 17 · Informe de resultados

**Fecha de corte:** 31/10/2026 · **Versión del sistema:** VC.Captura 0.1.2, VC.Concurso 0.2.1, VC.Analisis 0.1.6, VC.Notificador 0.1.2, VC.Datos 0.1.0, VC.Expediente 0.2.1; API, dashboard y base de datos con las migraciones al 31/10/2026.

Este informe separa tres tipos de resultado:

- **Medido:** sale de la operación real del sistema, con datos reales de Guatecompras, y se puede verificar en la base de datos, en Orchestrator o en los registros.
- **Prueba automática:** lo comprueba una prueba que se ejecuta con `npm test` o `dotnet test`.
- **Simulado:** escenario de demostración con una empresa **ficticia**. Se presenta así porque **no se consiguió una empresa piloto** antes de la entrega. Sus cifras **no son mediciones de una empresa real**.

## 17.1 Qué se construyó

| Componente | Estado | Evidencia |
|---|---|---|
| 6 procesos UiPath publicados en Orchestrator (7 puntos de entrada) | En operación | Orchestrator, carpeta `Shared` |
| 3 colas, 15 assets, catálogo de Action Center `VC_ValidacionFichas`, 7 disparadores | Configurado con scripts | `infra/orchestrator/*.ps1` |
| Robot desatendido en la PC del proyecto | En operación desde el 31/10/2026 | Trabajos con origen *Trigger* y *Manual* desde la API |
| API (Fastify + Prisma, 12 módulos de rutas para robots y dashboard) | En operación | 76 pruebas automáticas |
| Base de datos PostgreSQL con 11 migraciones | En operación | `api/prisma/migrations` |
| Dashboard Angular (10 páginas) | En operación | `web/` |
| Extracción con IA (Claude, salida estructurada y validación con Zod) | En operación | Fichas reales en la base |
| Datos abiertos OCDS y 6 banderas rojas | Cargado | 674 900 procesos |
| Avisos por correo y Telegram | En operación | Tabla `notificacion`; bot @vigiacontratacionesbot |
| Expediente de oferta (Excel y Word generados sin Office) | En operación | `C:\Vigia\Expedientes` |

## 17.2 Resultados medidos de la operación real

### Captura (OE1)

| Métrica | Valor | Fuente |
|---|---|---|
| Concursos en el boletín del 31/10/2026 | 850 | Prueba de punta a punta de `VC.Captura` |
| Candidatos preseleccionados y encolados ese día | 50 (tope diario `PRESELECCION_MAX_DIARIO`) | Cola `VC_Concursos` |
| Concursos registrados en la base | 2 837 | Tabla `concurso` |
| Concursos con detalle leído del portal | 15 | Tres ejecuciones de `VC.Concurso`, la última desatendida |
| Documentos reales descargados | 23 (15 escaneados, **65 %**) | Tabla `documento` |
| Tiempo de `VC.Concurso` por tanda de 5 concursos | ~4 minutos, con pausas de 2–3 s entre acciones | Trabajo del 31/10/2026, 15:16–15:20 |
| Verificaciones de Cloudflare durante las ejecuciones | 0 | Registro del robot |

### Extracción con IA (OE2)

| Métrica | Valor |
|---|---|
| Fichas de concursos reales | 11 (5 validadas por una persona, 3 por la IA, 3 esperando validación) |
| Llamadas a Claude registradas (incluye pruebas con bases sintéticas) | 14, total **US$ 1.38** |
| Costo por concurso real con bases completas | US$ 0.15 – 0.20 |
| Costo por concurso real con pocos documentos | US$ 0.05 |
| Tokens promedio por llamada | 8 494 de entrada, 3 217 de salida |
| Tasa de validación humana | 8 de 11 fichas reales pasaron o están pasando por Action Center |

La tasa de validación humana es alta por dos razones medidas:

1. El 65 % de los documentos son escaneados. Claude los lee como PDF, pero la API no puede comprobar las citas de página contra un texto.
2. Varias compras directas no publican bases con requisitos.

El 31/10/2026 se corrigió el cálculo de confianza: las citas a páginas escaneadas y la fecha ausente en las bases ya no cuentan como error. Los cambios están en [09](09-ia-extraccion.md).

### Validación humana, avisos y expediente

| Métrica | Valor |
|---|---|
| Tareas de Action Center creadas, aprobadas y recogidas automáticamente | 5 de 5 (`RecogerRevisiones`, 31/10/2026 14:30) |
| Correos enviados por `VC.Notificador` | 5 |
| Chats de Telegram vinculados | 1 |
| Expedientes armados | 2. Atendido desde Assistant: **14 s**. Automático al marcar *Participaré*: **~20 s** de trabajo. |

### Datos abiertos y banderas rojas (OE4, OE5)

| Métrica | Valor |
|---|---|
| Procesos OCDS cargados (2025–2026) | 674 900 |
| Adjudicaciones | 554 114 |
| Proveedores | 14 549 |
| IR-01 · Un solo oferente en proceso competitivo | 22 673 procesos |
| IR-02 · Proveedor recurrente con la misma entidad | 5 399 |
| IR-03 · Plazo de ofertas corto | 2 955 |
| IR-04 · Posible fraccionamiento (mismo día, unidad, proveedor y producto) | 176 138 |
| IR-05 · Monto atípico por categoría y modalidad | 1 142 |
| IR-08 · Adjudicación con diferencia atípica frente al estimado | 870 |
| IR-06 | No calculable con los datos publicados ([ADR-0007](adr/0007-fuente-ocds.md)) |

### Ejecuciones de los robots

Con corte al 31/10/2026 15:30, la bitácora (dashboard → Ejecuciones) registra **8 trabajos terminados con 6 exitosos (75 %)**. Las fallas fueron de `RecogerRevisiones` (error 2409 de Action Center al listar tareas con `Get Form Tasks`). Se corrigió en `VC.Analisis` 0.1.7, que consulta cada tarea por su número ([08 · 8.5](08-diseno-del-bot.md)). La meta de 95 % durante 7 días seguidos **todavía no se puede afirmar**: el robot desatendido opera desde el 31/10/2026.

## 17.3 Casos de prueba

| Caso | Resultado | Cómo se comprobó |
|---|---|---|
| CP-01 Boletín con concursos compatibles | ✅ | Prueba automática (parser, 16 casos) y operación real (850 → 50) |
| CP-02 NOG ya existente | ✅ | Prueba automática (`boletin.test.ts`: segunda carga, 0 nuevos) |
| CP-03 Documento con el mismo hash | ✅ | Prueba automática (`concursos.test.ts`) |
| CP-04 Cambio de estructura del portal | ✅ | Prueba automática (`DetallePortalTests`: `CAMBIO_ESTRUCTURA`) |
| CP-05 Fallo de red en un concurso | ✅ | Operación real: descargas con error → excepción del sistema, el elemento se reintentó en la siguiente ejecución |
| CP-06 Adenda en concurso seguido | ✅ parcial | Prueba automática de detección de cambios y aviso. Todavía no se observó una adenda real. |
| CP-07 Respuesta de IA inválida | ✅ | Prueba automática (`analisis.test.ts`) y reintento con errores en `AnalizarConIa.cs` |
| CP-08 PDF escaneado | ✅ | Operación real: 15 documentos escaneados leídos por Claude como PDF |
| CP-09 Perfil con todos los documentos | ✅ | Prueba automática (`compatibilidad.test.ts`) |
| CP-10 Concurso cerrado no aparece en el resumen | ✅ | Prueba automática (`notificaciones.test.ts`) |
| CP-11 Compatibilidad bajo el umbral | ✅ | Prueba automática (`notificaciones.test.ts`) |
| CP-12 Presupuesto de IA agotado | ✅ | Prueba automática (`analisis.test.ts`) |
| CP-13 IR-01 sobre datos de prueba | ✅ | Prueba automática (`ocds.test.ts`) |
| CP-14 Usuario A consulta el perfil de B | ✅ | Prueba automática (`autenticacion.test.ts`: 403) |
| CP-15 5 intentos fallidos | ✅ | Prueba automática (`autenticacion.test.ts`: 423) |
| CP-16 Ficha con fecha distinta → Action Center → HUMANO | ✅ | Operación real (NOG 99300002 y 5 concursos reales) |
| CP-17 Expediente con documento vencido | ✅ | Prueba automática (API y robot) y operación real (solvencia fiscal vencida, NOG 32557469) |
| CP-18 NOG manual desde el dashboard | ✅ parcial | Ruta y página construidas; el NOG entra a `VC_Concursos` con prioridad alta y tipo `MANUAL`. Falta capturar uno desde la página en la demostración. |
| CP-19 Verificación de Cloudflare | ⚠ No observada | El robot tiene el flujo de espera, pero el portal no pidió verificación en ninguna ejecución |
| CP-20 Parser sobre boletines reales | ✅ | Prueba automática con el boletín real del 30/10/2026 |

## 17.4 Cumplimiento de los objetivos

| Objetivo | Meta | Estado |
|---|---|---|
| OE1 · Robots que capturan a diario | ≥ 95 % de ejecuciones exitosas | **Construido y en operación.** Falta la medición de 7 días. |
| OE2 · IA que extrae la ficha | ≥ 85 % de exactitud | **Construido.** Falta la evaluación con 30–50 concursos ([13.4](13-plan-de-pruebas.md)); por ahora hay 5 validaciones humanas. |
| OE3 · Motor de compatibilidad | ≥ 80 % de alertas relevantes | **Construido** (puntaje preliminar y completo, calificación 👍/👎). Falta que usuarios reales califiquen. |
| OE4 · Datos OCDS | 2020–actual consultable | **Parcial:** se cargaron 2025–2026 (674 900 procesos). Los años 2020–2024 están disponibles en la misma fuente; se cargan con `npm run ocds:cargar -- 2020 2021 2022 2023 2024`. |
| OE5 · Indicadores de riesgo | ≥ 5 indicadores | **Cumplido:** 6 indicadores calculados y documentados |
| OE6 · Evaluación con empresa piloto | ≥ 70 % menos tiempo | **No medido con empresa real.** Ver el escenario simulado (17.5). |
| OE7 · Expediente automatizado | ≥ 50 % menos tiempo de armado | **Construido.** El armado de la carpeta toma 8–20 s frente a 60–120 min estimados manualmente. La comparación con tiempo manual medido queda pendiente. |

## 17.5 Escenario simulado de piloto (empresa ficticia)

> **Aviso:** esta sección es una **simulación con una empresa ficticia**, no un piloto. Los tiempos manuales (AS-IS) son las estimaciones de [01 · Planteamiento](01-planteamiento-del-problema.md#14-proceso-actual-as-is), no mediciones. Los tiempos del sistema (TO-BE) sí son los medidos el 31/10/2026. Sirve para mostrar el método de evaluación y el orden de magnitud esperado. **No debe presentarse como resultado de una empresa real.**

**Empresa ficticia:** "Empresa de prueba · insumos médicos y cómputo" (perfil cargado en el sistema). Vende equipo de cómputo e insumos, entrega en el departamento de Guatemala, tiene RTU, RGAE y patente vigentes y su solvencia fiscal vencida.

**Día simulado:** un boletín de 850 concursos, 50 candidatos, 5 concursos compatibles y participación en 1.

| Paso | AS-IS estimado (min) | TO-BE con el sistema (min) | Base del TO-BE |
|---|---|---|---|
| Buscar concursos | 15–30 | 0 | Boletín y preselección automáticos |
| Abrir y revisar datos generales | 20–40 | 5 | Leer el resumen de Telegram o del correo |
| Descargar bases | 5–10 | 0 | `VC.Concurso` las descarga |
| Leer bases de 5 concursos y ver si califica | 150–450 (30–90 c/u) | 25 (5 c/u) | Leer la ficha y los faltantes; validar en Action Center si hace falta |
| Anotar concursos de interés | 10 | 0 | Botón Seguir |
| Revisar adendas | 15–30 | 0 | Avisos de cambio |
| Buscar precios anteriores | 30–60 | 5 | "Compras anteriores parecidas" en el detalle |
| Armar el expediente de 1 concurso | 60–120 | 15 | Carpeta automática; la persona revisa el checklist y completa los borradores |
| **Total del día** | **305–750** | **50** | |
| **Reducción** | | **84 % – 93 %** | Meta OE6: ≥ 70 % |

Costo de IA del día simulado: 5 fichas × US$ 0.18 ≈ **US$ 0.90** (con el tope diario configurable de US$ 2).

**Para convertir esta simulación en un piloto real:**

1. Durante 5 días, la empresa mide su proceso manual paso por paso (plantilla de la tabla anterior).
2. Se carga su perfil real y se dejan correr los robots 7 días.
3. La empresa califica las alertas (👍/👎) y mide el tiempo con el sistema.
4. Se comparan 30–50 fichas con su lectura de las bases ([13.4](13-plan-de-pruebas.md)).

## 17.6 Limitaciones conocidas

- **Dependencia de la PC:** el robot desatendido usa la sesión de Windows de una PC (licencia Community, 1 robot). Si se apaga o se cierra la sesión, los trabajos esperan en cola.
- **Captcha:** si Guatecompras empieza a pedir verificación con frecuencia, `VC.Concurso` necesita a una persona. Nunca se automatiza esa verificación ([ADR-0006](adr/0006-boletin-y-robot-atendido.md), [ADR-0008](adr/0008-automatizar-pasos-atendidos.md)).
- **Documentos escaneados:** la IA los lee, pero la confianza se verifica menos. Más fichas pasan por una persona.
- **Boletín con un día de desfase:** los concursos de hoy se conocen mañana.
- **Embeddings:** la compatibilidad por contenido usa palabras clave; la búsqueda semántica con pgvector queda como mejora.
- **Despliegue:** API y dashboard corren en la PC del proyecto (Docker Compose). Para producción hace falta un servidor y HTTPS.

## 17.7 Trabajo futuro

1. Piloto real con una MiPyme y evaluación de exactitud con 30–50 fichas.
2. Cargar OCDS 2020–2024.
3. Búsqueda semántica con pgvector para la compatibilidad.
4. Despliegue en servidor con robot desatendido en una VM (sin depender de una PC personal).
5. Solicitud institucional a DIGAE/MINFIN de acceso autorizado al detalle de los concursos.
