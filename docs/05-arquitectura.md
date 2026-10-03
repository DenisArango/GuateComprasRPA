# 05 · Arquitectura y stack

## 5.1 Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| **Robot RPA** | **Playwright** + TypeScript | Automatización de navegador madura, espera automática de elementos, capturas y trazas para depuración, ejecución sin interfaz (headless). Ver [ADR-0002](adr/0002-plataforma-rpa.md). |
| Alternativa RPA | UiPath Community / Power Automate Desktop | Si el curso exige una plataforma RPA comercial. La arquitectura permite cambiar solo esta capa. |
| **Backend / API** | Node.js + **Fastify** + TypeScript | Rendimiento, validación de esquemas integrada, mismo lenguaje que el robot. |
| **ORM** | **Prisma** | Migraciones versionadas, tipado de extremo a extremo. |
| **Base de datos** | **PostgreSQL 16** | Gratuita, soporte JSONB para documentos OCDS, búsqueda de texto completo y extensión `pgvector` para similitud semántica. Ver [ADR-0003](adr/0003-base-de-datos.md). |
| **Cola de trabajos** | **pg-boss** | Cola sobre PostgreSQL: reintentos, programación y concurrencia sin agregar Redis. |
| **Planificador** | pg-boss (cron) | Ejecuciones programadas persistentes. |
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
| **Pruebas** | Vitest (unitarias), Playwright Test (end-to-end) | |

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

    V -->|Navega y descarga<br/>documentos - RPA| GC
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
        API["API REST<br/><i>Fastify + Prisma</i>"]
        BOT["Robot RPA<br/><i>Playwright</i>"]
        WRK["Workers<br/><i>Node.js</i><br/>Documentos · IA · Compatibilidad<br/>OCDS · Riesgos · Notificaciones"]
        DB[("PostgreSQL<br/>Datos + cola pg-boss")]
        FS[("Almacén de<br/>documentos")]
    end

    GC["Guatecompras"]
    OC["Portal OCDS"]
    LLM["Servicio de IA"]
    NOT["Correo / Telegram"]

    U -->|HTTPS| WEB
    WEB -->|JSON/HTTPS| API
    API --> DB
    API -->|Encola trabajos| DB

    BOT -->|Toma trabajos<br/>de captura| DB
    BOT -->|Navega| GC
    BOT -->|Guarda PDF| FS
    BOT -->|Registra concursos<br/>y encola extracción| DB

    WRK -->|Toma trabajos| DB
    WRK -->|Lee PDF| FS
    WRK --> LLM
    WRK --> OC
    WRK --> NOT
```

**Decisión clave:** el robot **no llama a la IA ni envía notificaciones**. Solo captura y encola. Esto lo mantiene simple y reemplazable (por ejemplo, por UiPath) sin tocar el resto del sistema.

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

    subgraph BOT["Robot RPA"]
        B_SRCH[Buscador]
        B_DET[Lector de detalle]
        B_DL[Descargador]
        B_CHG[Detector de cambios]
        B_SEL[Selectores centralizados]
    end

    R_CON --> SCH
    W_IA --> SCH
    W_COM --> SCH
    W_RIE --> CFG
    B_SRCH --> B_SEL
    B_DET --> B_SEL
```

## 5.5 Estructura del monorepo

```
vigia-contrataciones/
├── bot/
│   └── src/
│       ├── selectors.ts        # Todos los selectores del portal (RNF-07)
│       ├── flows/              # buscar, leerDetalle, descargar, detectarCambios
│       ├── runner.ts           # Toma trabajos de la cola
│       └── evidence.ts         # Capturas y HTML ante fallos
├── api/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── routes/
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
    end

    subgraph VPS["Servidor VPS (Linux, 2 vCPU / 4 GB RAM)"]
        RP["Caddy<br/>Proxy inverso + HTTPS"]
        subgraph DC["Docker Compose"]
            C_WEB["web (Nginx + Angular)"]
            C_API["api"]
            C_WRK["workers"]
            C_BOT["bot (Playwright + Chromium)"]
            C_DB[("postgres")]
            V_DOC[("volumen: documentos")]
        end
    end

    USR -->|443| RP
    RP --> C_WEB
    RP --> C_API
    C_API --> C_DB
    C_WRK --> C_DB
    C_BOT --> C_DB
    C_BOT --> V_DOC
    C_WRK --> V_DOC
    C_BOT --> EXT
    C_WRK --> EXT
```

**Entornos:**

| Entorno | Uso | Infraestructura |
|---|---|---|
| Desarrollo | Programación local | Docker Compose en la computadora del desarrollador |
| Piloto | Uso real con la empresa | VPS económico o servidor propio |

## 5.7 Seguridad

| Aspecto | Medida |
|---|---|
| Autenticación | Correo + contraseña con hash argon2; JWT de corta duración |
| Autorización | Roles: `PROVEEDOR`, `ANALISTA`, `ADMIN`; cada usuario solo ve sus perfiles |
| Secretos | Variables de entorno; `.env` excluido del repositorio; `.env.example` versionado |
| Transporte | HTTPS obligatorio (Caddy con certificados automáticos) |
| Datos de la empresa | Acceso restringido por perfil; anonimización para el informe |
| Robot | Sin credenciales de Guatecompras; solo información pública |
| Dependencias | `npm audit` y Dependabot en GitHub |
