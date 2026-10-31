# 15 · Manual de usuario

Este manual es para las personas que usan Vigía de Contrataciones: el **encargado de licitaciones** de la MiPyme (usuario proveedor) y el **administrador** del sistema. La instalación y la operación técnica están en [16 · Manual técnico](16-manual-tecnico.md).

## 15.1 Qué hace el sistema por usted

Cada día, sin que usted haga nada:

1. Lee el boletín de concursos que Guatecompras publica por correo (unos 850 a 2 000 concursos por día).
2. Elige los que encajan con su empresa: lo que vende, dónde puede entregar, montos y modalidades.
3. Abre cada concurso elegido en Guatecompras y descarga sus documentos (bases, especificaciones, anexos).
4. Una IA lee los documentos y arma una **ficha**: qué se compra, cuánto, cuándo cierra, qué requisitos piden y qué garantías.
5. Compara los requisitos con los documentos que su empresa tiene vigentes y le dice **qué le falta**.
6. Le avisa por **correo** y por **Telegram**.

Usted interviene solo en tres momentos:

| Momento | Qué hace usted | Por qué no es automático |
|---|---|---|
| Guatecompras pide verificar que es una persona | Marca la casilla en la ventana de Edge que abrió el robot y presiona **Aceptar** en el aviso | El portal lo exige y el sistema **nunca** evade esa verificación. Casi nunca ocurre. |
| Le llega una tarea de validación en Action Center | Revisa la ficha propuesta, corrige lo que esté mal y la aprueba | La IA no pudo comprobar algún dato contra el portal o el texto de las bases. Una persona decide. |
| Decide participar en un concurso | Presiona **Participaré** en el dashboard | Es una decisión de negocio. Al presionarlo, el expediente de oferta se arma solo. |

## 15.2 Ingresar al dashboard

1. Abra el dashboard en el navegador (en desarrollo: `http://localhost:4200`).
2. Escriba su correo y su contraseña. Después de 5 intentos fallidos, la cuenta se bloquea 15 minutos.
3. La barra de la izquierda muestra el perfil de empresa activo y el menú.

## 15.3 Panel

Resumen del día para su empresa: oportunidades nuevas, concursos que sigue, cierres próximos y documentos por vencer. Desde cada tarjeta se llega al detalle.

## 15.4 Oportunidades

Lista de concursos compatibles, ordenados por puntaje (0 a 100).

- **Vistas:** *Abiertas* (aún reciben ofertas), *Siguiendo* (las que marcó) y *Todas*.
- **Buscar:** por palabra del título o de la entidad.
- **Puntaje preliminar** (barra clara): se calculó solo con los datos del boletín.
- **Puntaje completo** (barra oscura): se calculó con la ficha de la IA, incluidos los documentos que le faltan.

## 15.5 Detalle de un concurso

| Sección | Qué muestra |
|---|---|
| Encabezado | Título, entidad, modalidad, cierre, monto y enlace a Guatecompras. Botones **Seguir**, **Participaré** y **Descartar**. |
| Ficha | Resumen en lenguaje sencillo, objeto, plazo y lugar de entrega, garantías y requisitos con la página de las bases donde aparecen. Indica si la revisó una persona o la extrajo la IA. |
| Requisitos posiblemente restrictivos | Señales para revisar con calma (por ejemplo, una marca específica). **Son señales, no acusaciones.** |
| Por qué este puntaje | Cuánto aportó cada factor: categoría, contenido, departamento, monto y requisitos. |
| Te falta | Documentos que piden las bases y que su empresa no tiene vigentes al cierre. |
| Expediente de oferta | Aparece cuando marcó **Participaré**: la carpeta armada y lo que falta. |
| Documentos | Los archivos descargados del portal, para abrirlos sin volver a Guatecompras. |
| Compras anteriores parecidas | Procesos adjudicados similares (datos abiertos OCDS): quién ganó y por cuánto. |
| Calificar | 👍 relevante o 👎 no relevante. Ayuda a medir la precisión de las alertas. |

### Seguir, participar o descartar

- **Seguir:** recibirá avisos si el concurso cambia (adendas, nueva fecha, aclaraciones) y recordatorios 3 días y 1 día antes del cierre.
- **Participaré:** además de lo anterior, el robot **arma el expediente de oferta automáticamente** en la carpeta `C:\Vigia\Expedientes\Expediente_{NOG}` de la PC del robot. En un minuto aparece en la página.
- **Descartar:** el concurso deja de aparecer en sus oportunidades y avisos.

## 15.6 Expediente de oferta

La carpeta `Expediente_{NOG}` contiene:

| Elemento | Contenido |
|---|---|
| `01 Bases del concurso` | Todos los documentos publicados en el concurso |
| `02 Documentos de la empresa` | Copia de sus documentos **vigentes al cierre** (los vencidos no se copian) |
| `03 Borradores` | Carta de presentación de la oferta y declaración jurada, en Word, con los datos de su empresa. Lo que falta va entre corchetes. |
| `Checklist.xlsx` | Cada requisito con su estado: **Listo**, **Faltante**, **Vencido** o **Revisar**; la página de las bases y el archivo copiado |

Para que el robot copie sus documentos, guárdelos una vez en `C:\Vigia\Expedientes\_DocumentosEmpresa` con el **código al inicio del nombre**:

| Documento | Nombre del archivo (ejemplos) |
|---|---|
| RTU | `RTU.pdf`, `RTU 2026.pdf` |
| Constancia del RGAE | `RGAE.pdf` |
| Patente de empresa / de sociedad | `PATENTE_EMPRESA.pdf`, `PATENTE_SOCIEDAD.pdf` |
| Solvencia fiscal | `SOLVENCIA_FISCAL octubre.pdf` |
| DPI del representante legal | `DPI_REPRESENTANTE.pdf` |
| Nombramiento | `NOMBRAMIENTO.pdf` |
| Declaración jurada | `DECLARACION_JURADA.pdf` |
| Carta de distribuidor | `CARTA_DISTRIBUIDOR.pdf` |
| Registro sanitario | `REGISTRO_SANITARIO.pdf` |
| Constancias de experiencia | `EXPERIENCIA.pdf` |
| Estados financieros | `ESTADOS_FINANCIEROS.pdf` |

También puede armar el expediente desde **UiPath Assistant**: ejecute **VC.Expediente** y escriba el NOG. En ese modo el robot pregunta si actualizar una carpeta existente y al final abre la carpeta y muestra un resumen.

## 15.7 Perfil de empresa

Aquí se define qué concursos le interesan. Los cambios recalculan la compatibilidad de todos los concursos al guardar.

| Campo | Para qué sirve |
|---|---|
| Nombre y NIT | Aparecen en los borradores del expediente |
| Categorías | Categorías de Guatecompras de lo que vende |
| Palabras clave | Se buscan en el título y el objeto (sin distinguir tildes ni mayúsculas). Ej.: *tóner*, *computadora*, *guantes*. |
| Modalidades | Cotización, licitación, compra directa. Sin selección: todas. |
| Departamentos | Dónde puede entregar. Sin selección: todo el país. |
| Monto mínimo y máximo | Rango de montos que le interesa |
| Compatibilidad mínima para avisar | Bajo este puntaje no se le avisa (por defecto 60) |
| Documentos de la empresa | Los que tiene y su fecha de vencimiento. Con ellos se calculan los faltantes y los avisos de vencimiento (30 días antes). |

### Avisos por Telegram

1. En **Perfil de empresa → Avisos por Telegram**, presione **Vincular Telegram**.
2. Se abre Telegram con el bot **@vigiacontratacionesbot**. Presione **Iniciar**.
3. El bot confirma y la página se actualiza sola. El enlace vale 15 minutos y sirve una sola vez.

Recibirá en Telegram la misma información que por correo, en versión corta: el resumen de las 07:00, las fichas listas y los cambios de los concursos que sigue. Puede vincular varios chats (por ejemplo, el del gerente) y quitarlos con **Quitar Telegram**.

## 15.8 Historial y banderas rojas (datos abiertos)

- **Historial:** busque procesos adjudicados en 2025–2026 (674 900 procesos de los datos abiertos OCDS) por texto, entidad, modalidad, monto o fecha. Sirve para conocer precios de referencia y competidores.
- **Proveedor:** al abrir un proveedor ve cuántos procesos ganó, con qué entidades y por cuánto.
- **Banderas rojas:** procesos con señales de riesgo (un solo oferente, adjudicación muy rápida, posible fraccionamiento, proveedor recurrente, monto atípico, entre otras). Cada bandera explica la evidencia. **Son señales para revisar, no acusaciones.**

## 15.9 Validar una ficha en Action Center

1. Le llega la tarea **"Validar ficha · NOG …"** ya asignada en Action Center (`cloud.uipath.com` → Action Center → Mis tareas).
2. El formulario muestra el motivo de la revisión, el resumen, el monto, la fecha límite y la ficha completa en JSON.
3. Corrija lo que esté mal (comparando con las bases) y presione **Aprobar**. Si el concurso no sirve, **Rechazar**.
4. En menos de 30 minutos el robot guarda la ficha como **validada por una persona** y envía los avisos.

## 15.10 Funciones del administrador

### Ejecuciones de los robots

Menú **Administración → Ejecuciones**:

- **Tasa de éxito** de los trabajos del periodo (meta: 95 %) y el costo de IA.
- **Por proceso:** cuántas veces corrió cada robot y su tasa de éxito. El botón **Ejecutar ahora** inicia el proceso en el robot desatendido.
- **Bitácora:** cada trabajo con su inicio, duración, resultado (concursos, documentos, fichas, avisos o expedientes) y, si falló, el motivo. El ícono abre el trabajo en Orchestrator.

### Capturar un NOG a mano

En la misma página, **Capturar un NOG**: escriba el NOG de un concurso que no vino en el boletín y presione **Capturar**. Entra a la cola con prioridad alta y sigue el camino normal: detalle, documentos, ficha y avisos.

## 15.11 Preguntas frecuentes

| Pregunta | Respuesta |
|---|---|
| ¿Por qué un concurso aparece hasta el día siguiente? | El boletín de Guatecompras trae los concursos publicados el día anterior. |
| ¿Por qué una ficha dice "revisada por una persona"? | La IA no pudo comprobar algún dato y se validó en Action Center. |
| Un documento aparece como faltante y sí lo tengo | Regístrelo en el perfil con su fecha de vencimiento. Si vence antes del cierre, cuenta como faltante. |
| ¿La IA puede equivocarse? | Sí. Por eso cada dato trae la página de las bases y las fichas dudosas pasan por una persona. Confirme siempre en el documento oficial antes de ofertar. |
| ¿El sistema presenta la oferta por mí? | No. Prepara la información y el expediente; la oferta la presenta usted en Guatecompras. |
