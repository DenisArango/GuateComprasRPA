# ADR-0006 · Captura con boletín diario y robot atendido para documentos

**Estado:** Aceptada, modificada por [ADR-0008](0008-automatizar-pasos-atendidos.md) (VC.Concurso ahora corre por disparador) · **Fecha:** 2026-10-30 · **Modifica:** [ADR-0004](0004-uipath-como-centro.md) (tipo de robot de `VC.Captura` y `VC.Concurso`)

## Contexto

Al revisar Guatecompras antes de la fase 3 (30/10/2026) se encontró lo siguiente:

| Recurso | Protección | Contenido |
|---|---|---|
| Búsqueda de concursos (`/concursos/consultaConAvanz.aspx`) | **Cloudflare Turnstile** (captcha) | Filtros por estatus, fechas, entidad, categoría, modalidad |
| Detalle del concurso (`/concursos/consultaConcurso.aspx?o=5&nog=…`) | **Cloudflare Turnstile** | Datos generales, **documentos (bases)**, aclaraciones |
| Boletín diario (`/BoletinDiario/BoletinDiarioDD-MM-AAAA.html`) | Sin captcha, pero Cloudflare responde **403** a clientes HTTP que no son navegador (probado con .NET `HttpClient` el 30/10/2026) | **Todos** los concursos publicados el día anterior: NOG, fecha, modalidad, tipo, entidad, unidad compradora, descripción, categoría, enlace al detalle (~2 000 por día) |
| Suscripciones por correo (`/servicios/suscripcion.aspx`) | Ninguna | Boletín diario y boletín instantáneo de seguimiento de concursos y entidades |
| Portal OCDS (`ocds.guatecompras.gt`) | Cloudflare (desafío a clientes no navegador) | Datos abiertos |
| `robots.txt` | `Allow: /` para todos; `Content-Signal: search=yes, ai-train=no, use=reference` | — |

El captcha expresa que el operador del portal **no quiere acceso automatizado** a la búsqueda ni al detalle. Resolverlo de forma automática (servicios de resolución, navegadores modificados para no ser detectados) violaría el uso responsable definido en [08 · Diseño de los robots](../08-diseno-del-bot.md#88-uso-responsable-del-portal) y sería inaceptable en un proyecto académico.

## Decisión

1. **Descubrimiento con el boletín diario por correo.** Una cuenta de correo del proyecto se suscribe al *Boletín diario de concursos* de Guatecompras. `VC.Captura` (desatendido, en segundo plano) lee ese correo, guarda el HTML (es el mismo contenido que el boletín descargable) y lo interpreta y envía los concursos a la API, que hace una **preselección** con los perfiles activos: categoría, palabras clave en la descripción, entidad, modalidad y fecha de cierre vigente. Solo los candidatos entran a la cola `VC_Concursos`.
2. **Documentos con un robot atendido.** `VC.Concurso` pasa a ser un proceso **atendido**: corre en el navegador de una persona (el encargado de licitaciones o el administrador), que lo inicia desde UiPath Assistant al llegar en la mañana o con un trigger de Assistant. El robot abre el detalle de cada candidato y, **si aparece el captcha, se detiene y le pide a la persona que lo resuelva**; después continúa solo con los datos y las descargas.
3. **Sin evasión.** No se usan servicios de resolución de captchas, navegadores sin interfaz disfrazados ni rotación de identidades. El robot usa el navegador normal de la persona.
4. **Menos visitas al portal.** Gracias a la preselección, el robot abre solo los concursos que pueden interesar (decenas por día, no miles).
5. **Notificaciones en dos momentos:** a las 07:00 un **resumen preliminar** con los candidatos (datos del boletín); las **fichas completas**, a medida que `VC.Analisis` las termina.
6. **Acción institucional:** se enviará una carta de la universidad a DIGAE/MINFIN para informar del proyecto y pedir orientación o un acceso autorizado. Si lo conceden, `VC.Concurso` puede volver a ser desatendido sin cambiar el resto del diseño.

## Consecuencias

- ✅ El proyecto respeta las protecciones del portal y lo puede demostrar ante el catedrático y la empresa piloto.
- ✅ El robot atendido es un caso legítimo de *human in the loop* que se suma a Action Center: una persona interviene solo donde el proceso lo exige.
- ✅ El boletín da cobertura completa del día anterior, incluidas categorías que la búsqueda paginada haría lenta.
- ✅ La captura de documentos tarda minutos, no horas: solo candidatos y solo documentos nuevos (por hash).
- ⚠ La captura de documentos depende de que alguien inicie el robot cada mañana. Se mide como parte del tiempo TO-BE del piloto.
- ⚠ El boletín tiene un día de desfase: los concursos de hoy aparecen mañana. Para la mayoría de modalidades el plazo de ofertas es de varios días, así que el impacto es menor.
- ⚠ **Volumen:** el boletín del 30/10/2026 traía ~1 500 compras directas solo en Salud (casi todas del IGSS), frente a 29 cotizaciones y licitaciones. La preselección debe usar las palabras clave del perfil para las compras directas, y la API limita los candidatos diarios (parámetro `PRESELECCION_MAX_DIARIO`, inicial 50), ordenados por puntaje preliminar, para que la captura atendida no pase de unos minutos.
- ⚠ Si Guatecompras cambia el formato o la URL del boletín, se ajusta el parser (coded workflow `LeerBoletin`, con pruebas sobre boletines guardados).
- ⚠ La licencia debe incluir el uso atendido (UiPath Assistant) para la persona que ejecuta `VC.Concurso`. Ver R-16.
- ⚠ El portal OCDS también rechaza clientes que no son navegador. El ETL debe usar las descargas masivas publicadas o el registro de datos de Open Contracting Partnership. Ver R-17.
