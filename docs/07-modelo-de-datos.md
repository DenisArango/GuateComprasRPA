# 07 · Modelo de datos

El modelo se divide en cuatro dominios: **operación** (lo que captura el robot), **análisis** (lo que produce la IA), **empresa** (usuarios y perfiles) e **histórico** (datos OCDS y riesgos).

## 7.1 Diagrama entidad-relación

```mermaid
erDiagram
    ENTIDAD ||--o{ CONCURSO : publica
    CONCURSO ||--o{ DOCUMENTO : tiene
    CONCURSO ||--o{ CAMBIO_CONCURSO : registra
    CONCURSO ||--o| FICHA : "se resume en"
    FICHA ||--o{ REQUISITO : contiene
    FICHA ||--o{ CRITERIO_CALIFICACION : contiene
    CONCURSO ||--o{ COINCIDENCIA : genera
    PERFIL_EMPRESA ||--o{ COINCIDENCIA : recibe
    PERFIL_EMPRESA ||--o{ DOCUMENTO_EMPRESA : dispone
    PERFIL_EMPRESA ||--o{ SEGUIMIENTO : marca
    CONCURSO ||--o{ SEGUIMIENTO : "es seguido en"
    USUARIO }o--o{ PERFIL_EMPRESA : administra
    PERFIL_EMPRESA ||--o{ NOTIFICACION : recibe
    EJECUCION_ROBOT ||--o{ ERROR_ROBOT : registra
    EJECUCION_ROBOT ||--o{ CONCURSO : captura

    OCDS_PROCESO ||--o{ OCDS_ADJUDICACION : tiene
    OCDS_ADJUDICACION }o--|| PROVEEDOR : "adjudicada a"
    OCDS_PROCESO }o--|| ENTIDAD : "convocado por"
    OCDS_PROCESO ||--o{ INDICADOR_RIESGO : activa

    ENTIDAD {
        int id PK
        string codigo_gc "código en Guatecompras"
        string nombre
        string tipo "ministerio, municipalidad, autónoma..."
        string departamento
    }
    CONCURSO {
        int id PK
        string nog UK
        int entidad_id FK
        string titulo
        string unidad_compradora
        string modalidad
        string categoria
        decimal monto_estimado
        datetime fecha_publicacion
        datetime fecha_cierre
        string estado_gc "estado en Guatecompras"
        string estado_sistema "CAPTURADO, ANALIZADO..."
        string url
        jsonb instantanea "última versión vista"
        int ejecucion_id FK
        datetime creado_en
        datetime revisado_en
    }
    DOCUMENTO {
        int id PK
        int concurso_id FK
        string nombre_original
        string tipo "bases, anexo, adenda, aclaracion"
        string sha256
        string ruta_almacen
        int paginas
        boolean requiere_ocr
        text texto_extraido
        datetime publicado_en
    }
    CAMBIO_CONCURSO {
        int id PK
        int concurso_id FK
        string tipo "adenda, fecha, estado, aclaracion"
        jsonb antes
        jsonb despues
        text resumen_ia
        datetime detectado_en
    }
    FICHA {
        int id PK
        int concurso_id FK
        text resumen
        string objeto
        decimal monto
        string plazo_entrega
        string lugar_entrega
        datetime fecha_limite_ofertas
        jsonb garantias
        jsonb datos_completos "JSON validado"
        string modelo_ia
        int tokens_entrada
        int tokens_salida
        decimal costo_usd
        datetime generado_en
    }
    REQUISITO {
        int id PK
        int ficha_id FK
        string tipo "legal, tecnico, financiero, experiencia"
        string descripcion
        string documento_normalizado "RTU, RGAE, fianza..."
        boolean obligatorio
        string referencia "página o sección"
        boolean posible_restrictivo
    }
    CRITERIO_CALIFICACION {
        int id PK
        int ficha_id FK
        string criterio
        decimal ponderacion
    }
    USUARIO {
        int id PK
        string correo UK
        string hash_contrasena
        string nombre
        string rol "PROVEEDOR, ANALISTA, ADMIN"
        string telegram_chat_id
        boolean activo
    }
    PERFIL_EMPRESA {
        int id PK
        string nombre
        string nit
        string[] categorias
        string[] palabras_clave
        string[] departamentos
        decimal monto_min
        decimal monto_max
        int umbral_compatibilidad
        vector embedding "pgvector"
        string hora_resumen
        string[] canales
    }
    DOCUMENTO_EMPRESA {
        int id PK
        int perfil_id FK
        string documento_normalizado
        date vence_en
    }
    COINCIDENCIA {
        int id PK
        int concurso_id FK
        int perfil_id FK
        int puntaje
        jsonb detalle "componentes del puntaje"
        string[] faltantes
        boolean notificado
        string calificacion_usuario "relevante, no_relevante"
    }
    SEGUIMIENTO {
        int id PK
        int perfil_id FK
        int concurso_id FK
        string estado "siguiendo, participare, descartado"
        datetime actualizado_en
    }
    NOTIFICACION {
        int id PK
        int perfil_id FK
        string tipo "resumen, cambio, recordatorio"
        string canal "correo, telegram"
        string estado "enviado, fallido"
        jsonb contenido
        datetime enviado_en
    }
    EJECUCION_ROBOT {
        int id PK
        string tipo "captura, cambios, manual"
        string estado "EN_CURSO, EXITOSA, PARCIAL, FALLIDA"
        datetime inicio
        datetime fin
        int concursos_nuevos
        int documentos_descargados
        int errores
    }
    ERROR_ROBOT {
        int id PK
        int ejecucion_id FK
        string nog
        string tipo "RED, CAMBIO_ESTRUCTURA, ARCHIVO, OTRO"
        text mensaje
        string ruta_captura
        string ruta_html
        datetime ocurrido_en
    }
    OCDS_PROCESO {
        int id PK
        string ocid UK
        string nog
        int entidad_id FK
        string titulo
        string modalidad
        string categoria
        decimal monto_estimado
        datetime fecha_publicacion
        datetime fecha_cierre
        int numero_ofertas
        string estado
        jsonb raw
    }
    OCDS_ADJUDICACION {
        int id PK
        int proceso_id FK
        int proveedor_id FK
        decimal monto
        datetime fecha
    }
    PROVEEDOR {
        int id PK
        string nit UK
        string nombre
        date fecha_inscripcion_rgae
    }
    INDICADOR_RIESGO {
        int id PK
        int proceso_id FK
        string codigo "IR-01..."
        decimal valor
        text evidencia
        datetime calculado_en
    }
```

## 7.2 Diccionario de datos (tablas principales)

### CONCURSO

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| id | serial | No | Identificador interno |
| nog | varchar(20) | No | Número de Operación Guatecompras. Único (RN-01). |
| entidad_id | int | No | Entidad convocante |
| titulo | text | No | Descripción del concurso según Guatecompras |
| unidad_compradora | varchar(255) | Sí | Unidad ejecutora dentro de la entidad |
| modalidad | varchar(60) | No | Compra directa, cotización, licitación u otra |
| categoria | varchar(120) | Sí | Categoría de Guatecompras |
| monto_estimado | numeric(14,2) | Sí | Monto, si se publica |
| fecha_publicacion | timestamptz | No | |
| fecha_cierre | timestamptz | Sí | Fecha límite de ofertas |
| estado_gc | varchar(60) | No | Estado según Guatecompras |
| estado_sistema | enum | No | `CAPTURADO`, `TEXTO_EXTRAIDO`, `ANALIZADO`, `REVISION_MANUAL`, `NOTIFICADO`, `CERRADO`, `FINALIZADO`, `ERROR_CAPTURA` |
| url | text | No | Enlace al concurso |
| instantanea | jsonb | No | Último estado visto, usado para detectar cambios |

### DOCUMENTO

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| sha256 | char(64) | No | Hash del archivo; único por concurso (RN-02) |
| tipo | enum | No | `BASES`, `ESPECIFICACIONES`, `ANEXO`, `ADENDA`, `ACLARACION`, `OTRO` |
| requiere_ocr | boolean | No | Verdadero si el PDF no tiene texto digital |
| texto_extraido | text | Sí | Texto completo (índice de texto completo en español) |

### FICHA

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| datos_completos | jsonb | No | Respuesta de la IA validada contra el esquema (ver [09](09-ia-extraccion.md)) |
| tokens_entrada / salida | int | No | Para control de costos (RNF-11) |
| costo_usd | numeric(8,5) | No | Costo calculado de la llamada |

### COINCIDENCIA

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| puntaje | smallint | No | 0–100 |
| detalle | jsonb | No | Ej.: `{"categoria":30,"palabras":22,"departamento":10,"monto":15,"requisitos":15}` |
| faltantes | text[] | No | Documentos normalizados que la empresa no tiene vigentes |
| calificacion_usuario | enum | Sí | Retroalimentación para la métrica de precisión |

### Catálogo de documentos normalizados

La IA mapea cada requisito documental a un código común para poder compararlo con el perfil:

| Código | Documento |
|---|---|
| `RTU` | Registro Tributario Unificado actualizado |
| `RGAE` | Constancia de inscripción y precalificación en el RGAE |
| `PATENTE_EMPRESA` | Patente de comercio de empresa |
| `PATENTE_SOCIEDAD` | Patente de comercio de sociedad |
| `SOLVENCIA_FISCAL` | Solvencia fiscal |
| `DPI_REPRESENTANTE` | DPI del representante legal |
| `NOMBRAMIENTO` | Nombramiento del representante legal |
| `FIANZA_SOSTENIMIENTO` | Seguro de caución de sostenimiento de oferta |
| `FIANZA_CUMPLIMIENTO` | Seguro de caución de cumplimiento |
| `DECLARACION_JURADA` | Declaración jurada (Art. 26 y 80 de la Ley) |
| `CARTA_DISTRIBUIDOR` | Carta de distribuidor autorizado |
| `REGISTRO_SANITARIO` | Registro sanitario |
| `EXPERIENCIA` | Constancias o cartas de experiencia |
| `ESTADOS_FINANCIEROS` | Estados financieros |
| `OTRO` | Requisito no catalogado (se muestra textual) |

_El catálogo se ajustará con los requisitos reales encontrados en las bases durante la fase 4._

## 7.3 Índices relevantes

| Tabla | Índice | Uso |
|---|---|---|
| concurso | `UNIQUE (nog)` | Evitar duplicados |
| concurso | `(estado_sistema, fecha_cierre)` | Seguimiento y resumen diario |
| documento | `UNIQUE (concurso_id, sha256)` | RN-02 |
| documento | GIN `to_tsvector('spanish', texto_extraido)` | Búsqueda de texto completo |
| coincidencia | `(perfil_id, notificado, puntaje DESC)` | Armado del resumen |
| ocds_proceso | `(entidad_id, fecha_publicacion)` | Historial y riesgos |
| ocds_adjudicacion | `(proveedor_id, fecha)` | Perfil de proveedor |
| perfil_empresa | ivfflat/hnsw sobre `embedding` | Similitud semántica |
