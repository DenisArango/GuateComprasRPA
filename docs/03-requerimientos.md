# 03 · Requerimientos

Prioridad según **MoSCoW**: **M** = debe tener · **S** = debería tener · **C** = podría tener · **W** = no se hará en esta versión.

## 3.1 Requerimientos funcionales

### RF-CAP · Captura (robot RPA)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-CAP-01 | El robot debe ejecutarse automáticamente una vez al día en un horario configurable. | M |
| RF-CAP-02 | El robot debe buscar en Guatecompras los concursos publicados desde la última ejecución, aplicando filtros de modalidad, categoría y entidad. | M |
| RF-CAP-03 | El robot debe registrar por cada concurso: NOG, título, entidad, unidad compradora, modalidad, categoría, monto estimado (si existe), fecha de publicación, fecha de cierre y estado. | M |
| RF-CAP-04 | El robot debe descargar los documentos adjuntos de cada concurso nuevo (bases, especificaciones, anexos). | M |
| RF-CAP-05 | El robot debe calcular un hash de cada documento para evitar descargas duplicadas. | M |
| RF-CAP-06 | El robot debe revisar los concursos en seguimiento y detectar cambios: nuevas aclaraciones, adendas, cambio de fecha o de estado. | M |
| RF-CAP-07 | El robot debe permitir la ejecución manual de una captura para un NOG específico. | S |
| RF-CAP-08 | El robot debe registrar en bitácora cada ejecución: inicio, fin, concursos procesados, errores y capturas de pantalla en caso de fallo. | M |
| RF-CAP-09 | El robot debe reintentar automáticamente los pasos fallidos según la política de reintentos. | M |
| RF-CAP-10 | El robot debe capturar publicaciones NPG para el indicador de fraccionamiento. | W |

### RF-DOC · Procesamiento de documentos

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-DOC-01 | El sistema debe extraer el texto de documentos PDF con texto digital. | M |
| RF-DOC-02 | El sistema debe detectar documentos escaneados y aplicarles OCR. | S |
| RF-DOC-03 | El sistema debe soportar documentos Word (.doc/.docx) cuando se publiquen. | C |
| RF-DOC-04 | El sistema debe identificar y priorizar las secciones relevantes del documento (requisitos, garantías, criterios, plazos) antes de enviarlo a la IA. | S |

### RF-IA · Extracción con inteligencia artificial

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-IA-01 | El sistema debe generar una ficha estructurada por concurso con: objeto, monto, plazo de entrega, fecha límite de ofertas, requisitos legales, requisitos técnicos, garantías, criterios de calificación con ponderación, y lugar de entrega. | M |
| RF-IA-02 | La ficha debe validarse contra un esquema; si no cumple, se reintenta o se marca para revisión. | M |
| RF-IA-03 | Cada dato extraído debe incluir la referencia a la página o sección del documento de donde proviene. | S |
| RF-IA-04 | El sistema debe generar un resumen en lenguaje natural de 3 a 5 líneas. | M |
| RF-IA-05 | El sistema debe resumir el contenido de cada adenda y explicar qué cambió respecto a la versión anterior. | S |
| RF-IA-06 | El sistema debe señalar requisitos potencialmente restrictivos (marca específica, experiencia muy puntual). | C |

### RF-COM · Compatibilidad con la empresa

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-COM-01 | El usuario debe poder registrar el perfil de su empresa: productos o servicios, categorías, palabras clave, departamentos donde opera, rango de montos y documentos disponibles. | M |
| RF-COM-02 | El sistema debe calcular un puntaje de compatibilidad de 0 a 100 entre cada concurso y el perfil. | M |
| RF-COM-03 | El sistema debe listar los requisitos documentales que la empresa no tiene registrados. | M |
| RF-COM-04 | El usuario debe poder calificar cada alerta como relevante o no relevante. | S |
| RF-COM-05 | El sistema debe usar las calificaciones del usuario para ajustar futuras recomendaciones. | C |

### RF-OCDS · Datos abiertos

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-OCDS-01 | El sistema debe cargar los datos OCDS de Guatecompras desde 2020. | M |
| RF-OCDS-02 | El sistema debe actualizar los datos OCDS periódicamente (semanal). | S |
| RF-OCDS-03 | El sistema debe mostrar, para cada concurso nuevo, adjudicaciones anteriores similares de la misma entidad o categoría, con proveedor y monto. | M |
| RF-OCDS-04 | El sistema debe mostrar el perfil de un proveedor: concursos ganados, entidades, montos totales y periodo. | S |

### RF-RIE · Banderas rojas

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-RIE-01 | El sistema debe calcular al menos 5 indicadores de riesgo sobre los datos históricos (ver [10 · Banderas rojas](10-banderas-rojas.md)). | M |
| RF-RIE-02 | El sistema debe asignar a cada proceso un puntaje de riesgo compuesto. | S |
| RF-RIE-03 | El sistema debe mostrar un ranking de entidades y proveedores por indicadores activados. | S |
| RF-RIE-04 | Todo indicador debe mostrarse con su explicación y la leyenda de que es una señal y no una acusación. | M |

### RF-NOT · Notificaciones

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-NOT-01 | El sistema debe enviar un resumen diario por correo a una hora configurable. | M |
| RF-NOT-02 | El sistema debe enviar el resumen y alertas por Telegram. | S |
| RF-NOT-03 | El sistema debe enviar una alerta inmediata cuando cambie un concurso en seguimiento. | M |
| RF-NOT-04 | El sistema debe enviar un recordatorio antes del cierre de un concurso en seguimiento (configurable, por defecto 3 días y 1 día antes). | S |
| RF-NOT-05 | El sistema debe notificar al administrador cuando una ejecución del robot falle. | M |
| RF-NOT-06 | Envío por WhatsApp. | W |

### RF-WEB · Dashboard

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-WEB-01 | El usuario debe poder iniciar sesión con correo y contraseña. | M |
| RF-WEB-02 | El usuario debe ver la lista de concursos recomendados, ordenada por compatibilidad y fecha de cierre. | M |
| RF-WEB-03 | El usuario debe ver la ficha completa de un concurso: resumen, requisitos, faltantes, documentos, historial de cambios y referencias de precio. | M |
| RF-WEB-04 | El usuario debe poder marcar un concurso como "en seguimiento", "participaré" o "descartado". | M |
| RF-WEB-05 | El usuario debe poder administrar su perfil de empresa y sus documentos disponibles. | M |
| RF-WEB-06 | El usuario debe poder buscar concursos históricos por palabra clave, entidad, proveedor y rango de fechas. | S |
| RF-WEB-07 | El sistema debe mostrar un tablero de banderas rojas. | S |
| RF-WEB-08 | El administrador debe ver la bitácora de ejecuciones del robot, con errores y capturas. | M |
| RF-WEB-09 | El usuario debe poder exportar la lista de concursos a Excel. | C |

## 3.2 Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-01 | Disponibilidad | El robot debe completar con éxito ≥ 95 % de las ejecuciones diarias durante el piloto. |
| RNF-02 | Rendimiento | La captura diaria completa (búsqueda, descarga y extracción) debe terminar antes de las 6:30 para enviar el resumen a las 7:00. |
| RNF-03 | Rendimiento | Las pantallas del dashboard deben responder en menos de 2 segundos para consultas sobre el histórico. |
| RNF-04 | Exactitud | La extracción con IA debe alcanzar ≥ 85 % de exactitud por campo frente a revisión humana. |
| RNF-05 | Uso responsable | El robot no debe superar 1 solicitud cada 2–3 segundos al portal y debe ejecutarse en horario de baja demanda. |
| RNF-06 | Resiliencia | Un fallo en un concurso no debe detener la captura de los demás. |
| RNF-07 | Mantenibilidad | Los selectores del portal deben estar centralizados en un solo archivo de configuración para adaptarse a cambios del sitio. |
| RNF-08 | Observabilidad | Toda ejecución debe dejar bitácora estructurada; los fallos deben guardar captura de pantalla y HTML de la página. |
| RNF-09 | Seguridad | Contraseñas con hash (bcrypt o argon2); comunicación por HTTPS; claves de API en variables de entorno, nunca en el repositorio. |
| RNF-10 | Privacidad | Los datos de la empresa piloto se almacenan cifrados en reposo cuando el proveedor de base de datos lo permita, y se anonimizan en el informe. |
| RNF-11 | Costo | El costo de IA debe mantenerse por debajo de un presupuesto mensual definido (ver [09 · Extracción con IA](09-ia-extraccion.md#95-control-de-costos)). |
| RNF-12 | Portabilidad | Todo el sistema debe poder levantarse con Docker Compose en una sola máquina. |
| RNF-13 | Usabilidad | El resumen diario debe poder leerse en un teléfono en menos de 2 minutos. |
| RNF-14 | Trazabilidad | Cada dato extraído por IA debe poder rastrearse al documento y página de origen. |

## 3.3 Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | Un concurso se identifica de forma única por su NOG. |
| RN-02 | Un documento se considera nuevo si su hash SHA-256 no existe para ese concurso. |
| RN-03 | Un concurso se notifica en el resumen diario si su compatibilidad es ≥ al umbral del perfil (por defecto 60). |
| RN-04 | Los concursos con fecha de cierre vencida no se notifican como oportunidades nuevas. |
| RN-05 | Un cambio en un concurso en seguimiento genera alerta inmediata, sin esperar el resumen diario. |
| RN-06 | Si la IA no logra una ficha válida tras 2 reintentos, el concurso se notifica con datos básicos y la marca "revisión manual". |
| RN-07 | Los indicadores de riesgo solo se calculan sobre procesos adjudicados o terminados. |
| RN-08 | Los umbrales de modalidad de compra se parametrizan; no se codifican en el programa. |
| RN-09 | Un documento requerido se considera "faltante" si no hay un documento equivalente vigente en el perfil de la empresa. |
| RN-10 | El sistema nunca presenta ofertas ni realiza acciones en Guatecompras en nombre del usuario. |

## 3.4 Matriz de trazabilidad (objetivos → requerimientos)

| Objetivo | Requerimientos |
|---|---|
| OE1 · Robot de captura | RF-CAP-01 a 09, RNF-01, RNF-02, RNF-05 a 08 |
| OE2 · Extracción con IA | RF-DOC-01 a 04, RF-IA-01 a 06, RNF-04, RNF-11, RNF-14 |
| OE3 · Compatibilidad | RF-COM-01 a 05, RF-WEB-02 a 05 |
| OE4 · Datos OCDS | RF-OCDS-01 a 04, RF-WEB-06 |
| OE5 · Banderas rojas | RF-RIE-01 a 04, RF-WEB-07 |
| OE6 · Piloto | RF-NOT-01 a 05, RF-COM-04, RNF-13 |
