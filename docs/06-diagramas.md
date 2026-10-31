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
    subgraph BOT["🤖 Robots UiPath (madrugada)"]
        A1[Orchestrator inicia captura] --> A2[Robot lee el boletín diario<br/>y preselecciona candidatos]
        A2 --> A2b[Resumen preliminar 07:00]
        A2b --> A3[Robot atendido descarga documentos<br/>la persona solo resuelve el captcha]
        A3 --> A4[Robot obtiene ficha con IA<br/>validación humana si hace falta]
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
        D3 --> D4[Marcar 'Participaré']
        D4 --> D6[Robot atendido arma<br/>el expediente de oferta]
        D6 --> D7[Conseguir solo<br/>lo que falta]
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
| Armar expediente de oferta | Manual: buscar documentos, revisar vigencias | Robot atendido + checklist |
| Referencia de precios | Rara vez se hace | Automática con datos OCDS |
| **Tiempo diario** | **60–120 min** (a validar) | **10–15 min** (meta) |

## 6.4 Diagrama de secuencia · Captura diaria

```mermaid
sequenceDiagram
    autonumber
    participant OR as Orchestrator
    participant CAP as VC.Captura
    participant GC as Guatecompras
    participant CON as VC.Concurso
    participant ANA as VC.Analisis
    participant IA as Servicio IA
    participant API as API
    participant NOT as VC.Notificador

    OR->>CAP: Trigger de tiempo (02:00)
    CAP->>API: Registrar ejecución, leer filtros
    CAP->>GC: Descargar boletín diario
    GC-->>CAP: HTML con los concursos de ayer
    CAP->>API: Concursos del boletín
    API-->>CAP: Candidatos (preselección por perfiles)
    CAP->>OR: Add Queue Item (VC_Concursos) por candidato

    OR->>NOT: Trigger de tiempo (07:00)
    NOT->>NOT: Resumen preliminar por correo y Telegram

    Note over CON: 07:30 la persona inicia VC.Concurso<br/>en UiPath Assistant (atendido)
    loop Por cada elemento de VC_Concursos
        CON->>OR: Get Transaction Item
        CON->>GC: Abrir detalle
        opt Aparece la verificación de Cloudflare
            CON->>CON: Pedir a la persona que la resuelva
        end
        GC-->>CON: Datos + archivos PDF
        CON->>API: Registrar concurso y subir documentos
        CON->>OR: Add Queue Item (VC_Analisis)
        CON->>OR: Set Transaction Status
    end

    OR->>ANA: Trigger de cola
    loop Por cada elemento de VC_Analisis
        ANA->>API: Descargar documentos
        ANA->>ANA: Texto / OCR y segmentación
        ANA->>IA: Contexto + esquema
        IA-->>ANA: Ficha JSON
        ANA->>API: Validar (Zod) y guardar ficha
        API-->>ANA: Compatibilidad y faltantes calculados
        ANA->>OR: Add Queue Item (VC_Notificaciones, FICHA)
    end

    OR->>NOT: Trigger de cola
    NOT->>API: Ficha y perfiles compatibles
    NOT->>NOT: Enviar ficha por correo y Telegram
    NOT->>API: Registrar envíos
```

## 6.5 Diagrama de secuencia · Detección de cambios

```mermaid
sequenceDiagram
    autonumber
    participant OR as Orchestrator
    participant CON as VC.Concurso
    participant GC as Guatecompras
    participant API as API
    participant ANA as VC.Analisis
    participant NOT as VC.Notificador
    participant U as Usuario

    Note over OR: VC.Captura agregó elementos REVISION<br/>por cada concurso en seguimiento
    OR->>CON: Elemento REVISION (la persona ya inició VC.Concurso)
    CON->>GC: Abrir detalle del NOG
    GC-->>CON: Estado, fechas, documentos, aclaraciones
    CON->>API: Comparar con la última instantánea
    alt Documento nuevo (adenda)
        CON->>GC: Descargar
        CON->>API: Subir documento y registrar cambio
        CON->>OR: Add Queue Item (VC_Analisis, ADENDA)
        OR->>ANA: Trigger de cola
        ANA->>API: Resumen del cambio con IA
        ANA->>OR: Add Queue Item (VC_Notificaciones)
    else Cambió fecha o estado
        CON->>API: Registrar cambio
        CON->>OR: Add Queue Item (VC_Notificaciones)
    else Sin cambios
        CON->>API: Actualizar fecha de revisión
    end
    OR->>NOT: Trigger de cola
    NOT->>U: 🔔 Alerta inmediata
```

## 6.6 Diagrama de estados · Concurso (en el sistema)

```mermaid
stateDiagram-v2
    [*] --> PRESELECCIONADO: Boletín + preselección
    PRESELECCIONADO --> CAPTURADO: Robot atendido descarga documentos
    PRESELECCIONADO --> CERRADO: Nadie lo capturó antes del cierre
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

## 6.8 Diagrama de actividad · Manejo de errores (REFramework)

```mermaid
flowchart TD
    S([Process: un elemento de la cola]) --> T{¿Resultado?}
    T -- Éxito --> OK[Set Transaction Status:<br/>Successful]
    T -- Business Rule Exception --> BR[Set Transaction Status: Failed<br/>tipo Business, sin reintento]
    T -- System Exception --> EV[Guardar captura + HTML<br/>y subirlos a la API]
    EV --> CE{¿Selector no<br/>encontrado?}
    CE -- Sí --> AL[Alerta CAMBIO_ESTRUCTURA<br/>al administrador]
    CE -- No --> R
    AL --> R{¿Reintentos de la<br/>cola agotados?}
    R -- No --> RQ[Orchestrator reintenta<br/>el elemento]
    R -- Sí --> FS[Set Transaction Status: Failed<br/>tipo Application]
    FS --> RS[Reiniciar aplicación<br/>Init]
    OK & BR & RQ & RS --> N([Siguiente elemento])
    I([Init falla: portal caído]) --> F([Ejecución FALLIDA<br/>reintento programado en 1 h])
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
