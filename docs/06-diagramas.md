# 06 · Diagramas de procesos

## 6.1 Proceso actual (AS-IS)

```mermaid
flowchart TD
    I([Inicio del día]) --> A[Ingresar a Guatecompras]
    A --> B[Buscar concursos por<br/>palabra clave o categoría]
    B --> C{¿Hay concursos<br/>que parezcan<br/>relevantes?}
    C -- No --> Z([Fin: se repite mañana])
    C -- Sí --> D[Abrir cada concurso<br/>y revisar datos]
    D --> E[Descargar bases<br/>y anexos]
    E --> F[Leer bases completas<br/>30–80 páginas]
    F --> G{¿La empresa<br/>califica?}
    G -- No --> H[Descartar]
    G -- Sí --> J[Anotar en Excel]
    H --> K{¿Quedan<br/>concursos?}
    J --> K
    K -- Sí --> D
    K -- No --> L[Revisar concursos<br/>anotados por<br/>aclaraciones o adendas]
    L --> M{¿Hubo cambios?}
    M -- Sí --> N[Leer cambios y<br/>actualizar notas]
    M -- No --> O
    N --> O[Buscar a mano<br/>adjudicaciones previas<br/>para estimar precio]
    O --> Z

    style F fill:#fdd,stroke:#c33
    style L fill:#fdd,stroke:#c33
    style O fill:#fdd,stroke:#c33
```

En rojo, los pasos que más tiempo consumen y donde más errores ocurren.

## 6.2 Proceso propuesto (TO-BE)

```mermaid
flowchart TD
    subgraph BOT["🤖 Automático (madrugada)"]
        A1[Planificador inicia captura] --> A2[Robot busca concursos nuevos]
        A2 --> A3[Robot descarga documentos]
        A3 --> A4[IA genera ficha y resumen]
        A4 --> A5[Cálculo de compatibilidad<br/>y documentos faltantes]
        A5 --> A6[Agregar historial de<br/>adjudicaciones y precios]
        A1 --> B1[Robot revisa concursos<br/>en seguimiento]
        B1 --> B2{¿Cambios?}
        B2 -- Sí --> B3[IA resume el cambio]
        B3 --> B4[Alerta inmediata]
        A6 --> C1[Armar resumen diario]
        B2 -- No --> C1
    end

    subgraph HUM["👤 Usuario (7:00, 10–15 min)"]
        C1 --> D1[Leer resumen en<br/>correo o Telegram]
        D1 --> D2{¿Interesa?}
        D2 -- Sí --> D3[Abrir ficha en dashboard]
        D3 --> D4[Marcar 'Participaré'<br/>y preparar faltantes]
        D2 -- No --> D5[Descartar / calificar 👎]
    end
```

## 6.3 Comparación AS-IS vs TO-BE

| Actividad | AS-IS | TO-BE |
|---|---|---|
| Buscar concursos | Manual, diario | Robot |
| Descargar documentos | Manual | Robot |
| Leer bases | Manual, 30–90 min por concurso | IA; el usuario lee un resumen de 3–5 líneas |
| Determinar si califica | Criterio del encargado | Puntaje de compatibilidad + faltantes |
| Seguimiento de adendas | Manual, a veces se omite | Robot + alerta inmediata |
| Referencia de precios | Rara vez se hace | Automática con datos OCDS |
| **Tiempo diario** | **60–120 min** (a validar) | **10–15 min** (meta) |

## 6.4 Diagrama de secuencia · Captura diaria

```mermaid
sequenceDiagram
    autonumber
    participant PL as Planificador
    participant BOT as Robot RPA
    participant GC as Guatecompras
    participant FS as Almacén docs
    participant DB as PostgreSQL / Cola
    participant WD as Worker documentos
    participant IA as Servicio IA
    participant WC as Worker compatibilidad
    participant NT as Notificador

    PL->>DB: Encolar "captura-diaria" (02:00)
    BOT->>DB: Tomar trabajo
    BOT->>DB: Registrar inicio de ejecución
    BOT->>GC: Abrir buscador y aplicar filtros
    GC-->>BOT: Resultados (páginas)
    loop Por cada NOG nuevo
        BOT->>GC: Abrir detalle
        GC-->>BOT: Datos generales + lista de documentos
        BOT->>GC: Descargar documentos
        GC-->>BOT: Archivos PDF
        BOT->>FS: Guardar archivo (por hash)
        BOT->>DB: Insertar concurso y documentos
        BOT->>DB: Encolar "extraer-texto"
    end
    BOT->>DB: Registrar fin de ejecución

    WD->>DB: Tomar "extraer-texto"
    WD->>FS: Leer PDF
    WD->>WD: Extraer texto / OCR
    WD->>DB: Guardar texto, encolar "extraer-ficha"
    WD->>IA: Texto relevante + esquema
    IA-->>WD: Ficha JSON
    WD->>WD: Validar con Zod
    WD->>DB: Guardar ficha, encolar "compatibilidad"

    WC->>DB: Tomar trabajo, leer perfiles
    WC->>DB: Guardar puntaje y faltantes

    PL->>NT: Disparar "resumen-diario" (07:00)
    NT->>DB: Consultar oportunidades y cambios
    NT-->>NT: Generar mensajes
    NT->>NT: Enviar correo y Telegram
```

## 6.5 Diagrama de secuencia · Detección de cambios

```mermaid
sequenceDiagram
    autonumber
    participant BOT as Robot RPA
    participant GC as Guatecompras
    participant DB as PostgreSQL
    participant IA as Servicio IA
    participant NT as Notificador
    participant U as Usuario

    BOT->>DB: Concursos en seguimiento con cierre vigente
    loop Por cada concurso
        BOT->>GC: Abrir detalle del NOG
        GC-->>BOT: Estado, fechas, documentos, aclaraciones
        BOT->>DB: Comparar con última instantánea
        alt Hay documento nuevo (adenda)
            BOT->>GC: Descargar
            BOT->>DB: Guardar y registrar cambio
            DB->>IA: Resumir qué cambió
            IA-->>DB: Resumen del cambio
            DB->>NT: Evento "concurso-cambió"
            NT->>U: 🔔 Alerta inmediata
        else Cambió fecha o estado
            BOT->>DB: Registrar cambio
            DB->>NT: Evento "concurso-cambió"
            NT->>U: 🔔 Alerta inmediata
        else Sin cambios
            BOT->>DB: Actualizar fecha de revisión
        end
    end
```

## 6.6 Diagrama de estados · Concurso (en el sistema)

```mermaid
stateDiagram-v2
    [*] --> CAPTURADO: Robot registra NOG
    CAPTURADO --> TEXTO_EXTRAIDO: Texto / OCR listo
    CAPTURADO --> ERROR_CAPTURA: Fallo al descargar
    ERROR_CAPTURA --> CAPTURADO: Reintento
    TEXTO_EXTRAIDO --> ANALIZADO: Ficha IA válida
    TEXTO_EXTRAIDO --> REVISION_MANUAL: Ficha inválida tras reintentos
    REVISION_MANUAL --> ANALIZADO: Corrección manual
    ANALIZADO --> NOTIFICADO: Incluido en resumen
    NOTIFICADO --> ANALIZADO: Cambio detectado (re-análisis)
    NOTIFICADO --> CERRADO: Pasó la fecha de cierre
    CERRADO --> FINALIZADO: Adjudicado / desierto / anulado
    FINALIZADO --> [*]
```

## 6.7 Diagrama de estados · Concurso (en Guatecompras)

Referencia del ciclo de vida real que el robot debe reconocer:

```mermaid
stateDiagram-v2
    [*] --> Publicado
    Publicado --> RecepcionDeOfertas: Plazo de preguntas y aclaraciones
    RecepcionDeOfertas --> EnCalificacion: Cierre de recepción
    EnCalificacion --> Adjudicado
    EnCalificacion --> Desierto: Sin ofertas válidas
    Publicado --> Anulado
    RecepcionDeOfertas --> Anulado
    Adjudicado --> ContratoPublicado
    Adjudicado --> EnInconformidad: Inconformidad presentada
    EnInconformidad --> Adjudicado
    ContratoPublicado --> [*]
    Desierto --> [*]
    Anulado --> [*]
```

_Los nombres exactos de estados se confirmarán al levantar la estructura del portal en la fase 3._

## 6.8 Diagrama de actividad · Manejo de errores del robot

```mermaid
flowchart TD
    S([Paso del robot]) --> T{¿Éxito?}
    T -- Sí --> N([Siguiente paso])
    T -- No --> C{Tipo de error}
    C -- "Tiempo de espera /<br/>red" --> R{¿Intentos < 3?}
    R -- Sí --> W[Esperar 2^n × 5 s] --> S
    R -- No --> F
    C -- "Selector no<br/>encontrado" --> E[Guardar captura + HTML<br/>Error CAMBIO_ESTRUCTURA]
    E --> AL[Alerta al administrador]
    C -- "Archivo<br/>corrupto" --> M[Marcar documento<br/>para revisión]
    M --> N
    F[Registrar error en bitácora<br/>con captura] --> X{¿Error de un<br/>solo concurso?}
    X -- Sí --> N2([Continuar con siguiente NOG])
    X -- No --> AB([Abortar ejecución<br/>y alertar])
    AL --> X
```

## 6.9 Flujo de datos (DFD nivel 1)

```mermaid
flowchart LR
    GC[/Guatecompras/] -->|Concursos, documentos| P1((1. Capturar))
    OC[/Portal OCDS/] -->|Histórico| P5((5. Cargar OCDS))

    P1 -->|Concursos| D1[(D1 Concursos)]
    P1 -->|Archivos| D2[(D2 Documentos)]

    D2 --> P2((2. Extraer texto))
    P2 --> P3((3. Extraer ficha IA))
    P3 -->|Fichas, requisitos| D1

    U[/Usuario/] -->|Perfil| D3[(D3 Perfiles)]
    D1 --> P4((4. Compatibilidad))
    D3 --> P4
    P4 -->|Puntajes| D4[(D4 Coincidencias)]

    P5 --> D5[(D5 Histórico OCDS)]
    D5 --> P6((6. Banderas rojas))
    P6 --> D6[(D6 Indicadores)]

    D4 --> P7((7. Notificar))
    D5 --> P7
    P7 -->|Resumen, alertas| U
```
