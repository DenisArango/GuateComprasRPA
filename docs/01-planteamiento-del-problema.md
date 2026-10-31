# 01 · Planteamiento del problema

## 1.1 Contexto

**Guatecompras** es el Sistema de Información de Contrataciones y Adquisiciones del Estado de Guatemala, administrado por el Ministerio de Finanzas Públicas (MINFIN). La Ley de Contrataciones del Estado (Decreto 57-92 y sus reformas) obliga a las entidades públicas a publicar en él sus compras: ministerios, municipalidades, hospitales, entidades autónomas y descentralizadas.

Cada concurso se identifica con un **NOG** (Número de Operación Guatecompras) y pasa por un ciclo de vida público: publicación de bases, preguntas y aclaraciones, adendas, recepción de ofertas, calificación, adjudicación y contrato. Las compras sin concurso (baja cuantía y excepciones) se publican con un **NPG** (Número de Publicación Guatecompras).

Desde mayo de 2024, el MINFIN publica además los datos de contratación bajo el **Estándar de Datos para Contrataciones Abiertas (OCDS)** en `ocds.guatecompras.gt`, con información estructurada desde enero de 2020. Estos datos **no incluyen** el contenido de los documentos (bases, especificaciones, anexos) ni las publicaciones NPG.

### Modalidades de compra (referencia)

| Modalidad | Monto (Q) | Mecanismo |
|---|---|---|
| Baja cuantía | Hasta 25,000 | Compra directa sin concurso, publicación posterior (NPG) |
| Compra directa con oferta electrónica | 25,000 – 90,000 | Ofertas electrónicas en el sistema |
| Cotización | 90,000 – 900,000 | Concurso con bases y junta de cotización |
| Licitación pública | Más de 900,000 | Concurso con bases, junta de licitación y plazos mayores |

_Fuente: Ley de Contrataciones del Estado, Decreto 57-92, reformado por el Decreto 46-2016. Verificar reformas vigentes antes de la entrega final._

## 1.2 Problema

Las **micro, pequeñas y medianas empresas (MiPymes)** que venden o quieren vender al Estado enfrentan cuatro problemas que se repiten:

| # | Problema | Consecuencia |
|---|---|---|
| P1 | **Búsqueda manual y diaria.** Guatecompras publica a diario una gran cantidad de concursos, la mayoría irrelevantes para cada empresa. Filtrarlos exige revisar el portal todos los días. | 1–2 horas diarias de un empleado; en empresas pequeñas, del propio dueño. |
| P2 | **Lectura de documentos extensos.** Para saber si la empresa califica hay que leer bases de 30 a 80 páginas: requisitos legales, técnicos, garantías, criterios de calificación y plazos. | Decisiones tardías de participar o no; tiempo perdido en concursos donde no se calificaba. |
| P3 | **Cambios que no se ven.** Durante el concurso se publican aclaraciones y adendas que cambian requisitos o fechas. Nadie avisa al proveedor. | Ofertas descalificadas por un requisito nuevo; plazos que se mueven sin enterarse. |
| P4 | **Precio a ciegas.** La información de quién ganó y a qué precio existe, pero dispersa y difícil de consultar. | Ofertas por encima del mercado (se pierde) o muy por debajo (se gana con poco margen). |

**Problema central:**

> Las MiPymes proveedoras del Estado pierden oportunidades de negocio y tiempo productivo porque detectar, entender y dar seguimiento a los concursos de Guatecompras es un proceso **manual, repetitivo y propenso a errores**.

## 1.3 Necesidad

La MiPyme necesita, cada día y sin intervención manual:

1. Saber **qué concursos nuevos le aplican** según lo que vende, dónde y por cuánto.
2. Entender **qué piden y cuándo cierra** cada uno sin leer el documento completo.
3. Saber **qué le falta** para cumplir los requisitos.
4. Enterarse **de inmediato** si un concurso que sigue cambió.
5. Conocer **a quién y a qué precio** se ha adjudicado antes algo similar.

## 1.4 Proceso actual (AS-IS)

| Paso | Actividad | Responsable | Tiempo estimado* |
|---|---|---|---|
| 1 | Ingresar a Guatecompras y buscar concursos por palabras clave o categoría | Encargado de licitaciones | 15–30 min |
| 2 | Abrir cada concurso potencial y revisar datos generales | Encargado | 20–40 min |
| 3 | Descargar bases y anexos de los relevantes | Encargado | 5–10 min |
| 4 | Leer bases para determinar requisitos y si se califica | Encargado / gerente | 30–90 min por concurso |
| 5 | Anotar en Excel o cuaderno los concursos de interés | Encargado | 10 min |
| 6 | Volver a revisar concursos en seguimiento para ver aclaraciones o adendas | Encargado | 15–30 min |
| 7 | Buscar adjudicaciones anteriores para estimar precio | Gerente | 30–60 min (cuando se hace) |
| 8 | Reunir documentos de la empresa, revisar vigencias y armar el expediente de la oferta | Encargado | 60–120 min por concurso en el que se participa |

\* Estimaciones iniciales. **Se medirán con la empresa piloto** en la fase 1 (ver [13 · Plan de pruebas](13-plan-de-pruebas.md)).

El diagrama del proceso actual está en [06 · Diagramas](06-diagramas.md#61-proceso-actual-as-is).

## 1.5 Justificación

**Económica.** Liberar de 5 a 10 horas semanales de un empleado por empresa, y aumentar el número de concursos en los que la empresa participa con la información correcta.

**Técnica.** Es un caso donde la automatización robótica de procesos (RPA) es la herramienta adecuada:
- El proceso es **repetitivo, basado en reglas y de alto volumen**, las tres características que la literatura señala para elegir RPA.
- La información de documentos y de lo más reciente **no está disponible por API**; hay que obtenerla navegando el portal como lo haría una persona.
- Donde sí existen datos estructurados (OCDS), **no se usa RPA**: se consumen directamente. Esta separación es una decisión de diseño documentada en [ADR-0001](adr/0001-rpa-y-datos-abiertos.md).
- La IA resuelve la parte que el RPA tradicional no puede: **entender documentos no estructurados**. A esta combinación se le llama *automatización inteligente* (intelligent automation).

**Social.** El mismo sistema, aplicado a los datos históricos, permite detectar **señales de riesgo** en las contrataciones, lo que aporta a la transparencia del gasto público.

**Referentes reales.** En España, México y Chile existen servicios por suscripción de alertas de licitaciones públicas, y la Open Contracting Partnership publica metodologías de indicadores de riesgo (*red flags*) que usan organizaciones de transparencia en varios países.

## 1.6 Objetivos

### Objetivo general

Diseñar, implementar y evaluar un sistema de automatización inteligente basado en robots UiPath que monitoree Guatecompras, analice con IA los documentos de los concursos, notifique oportunidades relevantes a MiPymes proveedoras del Estado y prepare sus expedientes de oferta, reduciendo el tiempo de trabajo manual.

### Objetivos específicos

| # | Objetivo | Indicador de cumplimiento |
|---|---|---|
| OE1 | Desarrollar robots RPA en UiPath, orquestados con Orchestrator, que capturen diariamente los concursos nuevos y sus documentos de Guatecompras | ≥ 95 % de ejecuciones diarias exitosas durante el piloto |
| OE2 | Implementar un módulo de IA que extraiga la información clave de las bases | ≥ 85 % de exactitud por campo frente a revisión humana |
| OE3 | Construir un motor de compatibilidad que relacione los concursos con el perfil de la empresa | ≥ 80 % de las alertas calificadas como relevantes por el usuario |
| OE4 | Integrar los datos abiertos OCDS para ofrecer historial de adjudicaciones y precios | Datos 2020–actual cargados y consultables |
| OE5 | Implementar indicadores de riesgo sobre los datos históricos | Al menos 5 indicadores calculados y documentados |
| OE6 | Evaluar el sistema con una empresa piloto | Reducción ≥ 70 % del tiempo diario de revisión |
| OE7 | Automatizar con un robot atendido la preparación del expediente de oferta | Reducción ≥ 50 % del tiempo de armado del expediente |

## 1.7 Alcance

### Incluye

- Captura de concursos (NOG) en las **modalidades de cotización y licitación**, y compra directa con oferta electrónica.
- Prototipo limitado a **una o dos categorías** de producto (propuesta: *Salud e insumos hospitalarios* y *Computación y telecomunicaciones*).
- Descarga y análisis con IA de bases, especificaciones y adendas.
- Perfil de **una empresa piloto** (el sistema soportará varias, pero el piloto se hace con una).
- Carga de datos OCDS desde 2020.
- Alertas por **correo electrónico y Telegram**.
- Validación humana de fichas con baja confianza (Action Center).
- Robot atendido que arma el **expediente de oferta** (carpeta, checklist y borradores).
- Dashboard web de consulta.
- Al menos 5 indicadores de riesgo.

### No incluye

- Presentación automática de ofertas en nombre de la empresa (lo hace siempre una persona).
- Captura de publicaciones NPG de forma completa (queda como trabajo futuro; se documenta su valor para el indicador de fraccionamiento).
- Firma electrónica, pagos o cualquier operación que requiera las credenciales del proveedor en Guatecompras.
- Aplicación móvil nativa.
- Asesoría legal sobre las bases; el sistema **resume, no interpreta jurídicamente**.

## 1.8 Usuarios objetivo

| Usuario | Descripción | Rol en el proyecto |
|---|---|---|
| **MiPyme proveedora** (principal) | Empresa de 5 a 50 empleados que vende o quiere vender al Estado | Empresa piloto; usuario del sistema |
| **Gestor de licitaciones** | Persona o despacho que prepara ofertas para varias empresas | Usuario secundario; puede administrar varios perfiles |
| **Organización de transparencia / periodista de datos** | Red Ciudadana, Acción Ciudadana, medios de periodismo de datos | Validación del módulo de banderas rojas |
| **Academia** | Catedráticos y estudiantes | Uso del módulo de banderas rojas como herramienta de estudio |
