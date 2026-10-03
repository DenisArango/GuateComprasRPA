# 05 · Arquitectura y stack

## 5.1 Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| **Robot RPA** | **UiPath Studio** (REFramework, expresiones C#) + robot desatendido en Windows | Plataforma exigida por el curso. Ver [ADR-0002](adr/0002-plataforma-rpa.md). |
| **Orquestación del robot** | **UiPath Orchestrator** (Automation Cloud, plan Community/Free) | Triggers de horario, Queues por NOG, Assets para configuración y credenciales, logs de ejecución. |
| **Backend / API** | Node.js + **Fastify** + TypeScript | Rendimiento, validación de esquemas integrada. Expone además la API del robot (`/robot/*`). |
| **ORM** | **Prisma** | Migraciones versionadas, tipado de extremo a extremo. |
| **Base de datos** | **PostgreSQL 16** | Gratuita, soporte JSONB para documentos OCDS, búsqueda de texto completo y extensión `pgvector` para similitud semántica. Ver [ADR-0003](adr/0003-base-de-datos.md). |
| **Cola de trabajos** | **pg-boss** | Cola sobre PostgreSQL: reintentos, programación y concurrencia sin agregar Redis. |
| **Planificador** | Triggers de Orchestrator (robot) · pg-boss cron (workers, resumen diario) | Ejecuciones programadas persistentes. |
| **Extracción de texto** | pdf.js (`pdfjs-dist`) | Texto de PDF digitales. |
| **OCR** | Tesseract (`tesseract.js` o binario) con idioma español | PDF escaneados. |
| **IA** | API de un LLM con salida estructurada (JSON) | Extracción de fichas y resúmenes. Ver [09 · IA](09-ia-extraccion.md). |
| **Validación** | **Zod** | Esquema único compartido entre IA, API y frontend. |
| **Almacenamiento de documentos** | Sistema de archivos local → S3/MinIO compatible | Simple en el piloto, migrable. |
| **Notificaciones** | Nodemailer (SMTP) + **Bot de Telegram** | Gratuitos y fáciles de integrar. WhatsApp queda fuera por costo y aprobación. |
| **Frontend** | **Angular** + Angular Material | Framework completo, tipado, componentes listos para tablas y formularios. |
| **Gráficas** | ECharts | Tablero de banderas rojas e historial de precios. |
| **Contenedores** | Docker + Docker Compose | Despliegue reproducible (RNF-12). |
| **Control de versiones** | Git + GitHub | Repositorio único (monorepo). |
| **CI** | GitHub Actions | Lint, pruebas y build en cada push. |
| **Pruebas** | Vitest (unitarias e integración), casos de prueba de UiPath Studio (robot), Playwright Test (end-to-end del dashboard) | |

## 5.2 Diagrama de contexto (C4 nivel 1)

```mermaid
flowchart TB
    U["👤 Usuario proveedor<br/>(MiPyme)"]
    A["👤 Analista de<br/>transparencia"]
    AD["👤 Administrador"]

    V["🟦 Vigía de Contrataciones<br/>Captura, analiza y notifica<br/>oportunidades de compras públicas"]

    GC["⬜ Guatecompras<br/>Portal web de compras<br/>del Estado"]
    OC["⬜ Portal OCDS<br/>Datos abiertos de<br/>contratación"]
    LLM["⬜ Servicio de IA<br/>Modelo de lenguaje"]
    MAIL["⬜ Correo SMTP"]
    TG["⬜ Telegram"]

    U -->|Consulta oportunidades,<br/>gestiona su perfil| V
    A -->|Consulta riesgos<br/>e historial| V
    AD -->|Supervisa ejecuciones| V

    UIP["⬜ UiPath Orchestrator<br/>Programa y supervisa<br/>al robot"]

    V -->|Navega y descarga<br/>documentos - RPA| GC
    UIP -->|Inicia el robot,<br/>cola de NOG| V
    V -->|Descarga datos<br/>históricos| OC
    V -->|Envía texto de bases,<br/>recibe ficha JSON| LLM
    V -->|Resumen diario| MAIL
    V -->|Alertas| TG
    MAIL --> U
    TG --> U
```

## 5.3 Diagrama de contenedores (C4 nivel 2)

```mermaid
flowchart TB
    subgraph Usuarios
        U["👤 Usuarios"]
    end

    subgraph V["Vigía de Contrataciones (Docker Compose)"]
        WEB["Dashboard web<br/><i>Angular</i>"]
        API["API REST<br/><i>Fastify + Prisma</i><br/>incluye API del robot /robot/*"]
        WRK["Workers<br/><i>Node.js</i><br/>Documentos · IA · Compatibilidad<br/>OCDS · Riesgos · Notificaciones"]
        DB[("PostgreSQL<br/>Datos + cola pg-boss")]
        FS[("Almacén de<br/>documentos")]
    end

    subgraph W["Equipo Windows"]
        BOT["Robot RPA<br/><i>UiPath (desatendido)</i>"]
    end

    ORC["UiPath Orchestrator<br/><i>Automation Cloud</i>"]
    GC["Guatecompras"]
    OC["Portal OCDS"]
    LLM["Servicio de IA"]
    NOT["Correo / Telegram"]

    U -->|HTTPS| WEB
    WEB -->|JSON/HTTPS| API
    API --> DB
    API -->|Encola trabajos| DB
    API -->|Guarda PDF| FS
    API -->|Captura manual de NOG<br/>Orchestrator API| ORC

    ORC -->|Trigger, Queue,<br/>Assets| BOT
    BOT -->|Navega| GC
    BOT -->|Registra concursos, sube PDF<br/>y evidencias - HTTPS + clave| API

    WRK -->|Toma trabajos| DB
    WRK -->|Lee PDF| FS
    WRK --> LLM
    WRK --> OC
    WRK --> NOT
```

**Decisión clave:** el robot **no llama a la IA, no envía notificaciones ni accede directamente a la base de datos**. Solo captura y entrega los datos a la API del robot, que los registra y encola los trabajos. Así el robot UiPath queda simple y la lógica de negocio (deduplicación, detección de cambios, colas) vive en el sistema.

## 5.4 Componentes del backend (C4 nivel 3)

```mermaid
flowchart LR
    subgraph API["API (Fastify)"]
        AUTH[Auth<br/>JWT + roles]
        R_CON[Rutas concursos]
        R_PER[Rutas perfil]
        R_HIS[Rutas historial OCDS]
        R_RIE[Rutas riesgos]
        R_ADM[Rutas administración]
    end

    subgraph DOM["Dominio (paquete compartido)"]
        SCH[Esquemas Zod<br/>Ficha, Perfil, Requisito]
        CFG[Parámetros<br/>umbrales, modalidades]
    end

    subgraph WRK["Workers"]
        W_DOC[Extractor de texto / OCR]
        W_IA[Extractor IA]
        W_COM[Motor de compatibilidad]
        W_OCDS[ETL OCDS]
        W_RIE[Motor de banderas rojas]
        W_NOT[Notificador]
    end

    subgraph BOT["Robot RPA (UiPath)"]
        B_DSP[Dispatcher<br/>busca NOG y llena la Queue]
        B_PRF[Performer REFramework<br/>detalle y documentos]
        B_CHG[Revisión de seguimiento]
        B_SEL[Object Repository]
        B_CLI[Cliente API del robot]
    end

    R_ROB[Rutas robot<br/>/robot/*]

    R_CON --> SCH
    R_ROB --> SCH
    B_CLI --> R_ROB
    B_DSP --> B_SEL
    B_PRF --> B_SEL
    W_IA --> SCH
    W_COM --> SCH
    W_RIE --> CFG
```

## 5.5 Estructura del monorepo

```
vigia-contrataciones/
├── bot/                        # Proyectos UiPath Studio
│   ├── VigiaCaptura/           # REFramework: Dispatcher + Performer
│   │   ├── project.json
│   │   ├── Main.xaml
│   │   ├── Framework/          # Init, GetTransactionData, Process, SetTransactionStatus, End
│   │   ├── Flujos/             # Buscar, LeerDetalle, Descargar, RevisarSeguimiento
│   │   ├── Api/                # Llamadas HTTP a /robot/*
│   │   ├── .objects/           # Object Repository: selectores del portal (RNF-07)
│   │   ├── Data/Config.xlsx    # Parámetros no secretos
│   │   └── Tests/              # Casos de prueba de Studio + fixtures HTML
│   └── README.md               # Cómo abrir, publicar y configurar en Orchestrator
├── api/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── routes/             # incluye robot/ (API del robot)
│       ├── workers/            # documentos, ia, compatibilidad, ocds, riesgos, notificaciones
│       ├── domain/             # esquemas Zod y reglas
│       └── server.ts
├── web/                        # Angular
├── database/
│   ├── ocds/                   # scripts de carga
│   └── sql/riesgos/            # consultas de indicadores
├── infra/
│   ├── docker-compose.yml
│   └── .env.example
└── docs/
```

## 5.6 Diagrama de despliegue

```mermaid
flowchart TB
    subgraph Internet
        USR["Navegador / teléfono"]
        EXT["Guatecompras · OCDS · IA · SMTP · Telegram"]
        ORC["UiPath Orchestrator<br/>(Automation Cloud)"]
    end

    subgraph VPS["Servidor VPS (Linux, 2 vCPU / 4 GB RAM)"]
        RP["Caddy<br/>Proxy inverso + HTTPS"]
        subgraph DC["Docker Compose"]
            C_WEB["web (Nginx + Angular)"]
            C_API["api"]
            C_WRK["workers"]
            C_DB[("postgres")]
            V_DOC[("volumen: documentos")]
        end
    end

    subgraph WIN["Equipo Windows (PC o VM)"]
        ROB["UiPath Robot desatendido<br/>+ navegador (Chrome/Edge)"]
    end

    USR -->|443| RP
    RP --> C_WEB
    RP --> C_API
    C_API --> C_DB
    C_API --> V_DOC
    C_WRK --> C_DB
    C_WRK --> V_DOC
    C_WRK --> EXT
    C_API -->|Orchestrator API| ORC
    ORC <-->|Conexión saliente del robot| ROB
    ROB -->|Guatecompras| EXT
    ROB -->|443 /robot/*| RP
```

**Entornos:**

| Entorno | Uso | Infraestructura |
|---|---|---|
| Desarrollo | Programación local | Docker Compose + UiPath Studio en la computadora del desarrollador (Windows) |
| Piloto | Uso real con la empresa | VPS económico o servidor propio para el sistema; equipo Windows encendido de madrugada para el robot |

> El robot UiPath no forma parte de Docker Compose: necesita Windows. RNF-12 aplica al resto del sistema.

## 5.7 Seguridad

| Aspecto | Medida |
|---|---|
| Autenticación | Correo + contraseña con hash argon2; JWT de corta duración |
| Autorización | Roles: `PROVEEDOR`, `ANALISTA`, `ADMIN`; cada usuario solo ve sus perfiles |
| Secretos | Variables de entorno; `.env` excluido del repositorio; `.env.example` versionado |
| Transporte | HTTPS obligatorio (Caddy con certificados automáticos) |
| Datos de la empresa | Acceso restringido por perfil; anonimización para el informe |
| Robot | Sin credenciales de Guatecompras; solo información pública. Se autentica ante la API con una clave guardada como Credential Asset en Orchestrator; las rutas `/robot/*` solo aceptan esa clave |
| Dependencias | `npm audit` y Dependabot en GitHub |
