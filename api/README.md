# api

API de Vigía de Contrataciones: datos y reglas de dominio para los robots UiPath y el dashboard. Diseño en [docs/05-arquitectura.md](../docs/05-arquitectura.md).

## Requisitos

- **Node 24** (`.nvmrc`). Prisma 7 y Vitest 5 no funcionan con Node 20.11.
- PostgreSQL del `docker-compose` en el puerto **5433** (el 5432 lo usa el PostgreSQL local de Windows).
- Variables en `infra/.env` (ver `infra/.env.example`); la API necesita al menos `ROBOT_API_CLAVE`.

## Comandos

```powershell
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d   # desde la raíz
cd api
npm install
npm run db:migrate     # aplica las migraciones y genera el cliente de Prisma
npm run db:seed        # perfil de prueba (SEED_PROVEEDOR_CORREO: contacto que recibe los correos)
npm run ocds:cargar -- 2025 2026   # histórico OCDS (~15 min, ~300 MB por año) y banderas rojas
npm run ocds:cargar -- --riesgos   # solo recalcula las banderas rojas (~1 min)
npm run dev            # http://localhost:3000
npm test               # unitarias + integración contra la BD de desarrollo
npm run typecheck
```

## Rutas

| Ruta | Quién la usa | Descripción |
|---|---|---|
| `GET /salud` | Monitoreo | Estado de la API |
| `POST /robot/boletin` | `VC.Captura` | Recibe los concursos del boletín diario, guarda los nuevos y devuelve los candidatos preseleccionados (máximo `PRESELECCION_MAX_DIARIO`). Idempotente: reenviar el mismo boletín no repite candidatos. |
| `PUT /robot/concursos/:nog/detalle` | `VC.Concurso` | Guarda lo leído del detalle, registra los cambios respecto a la lectura anterior (fecha, estado, documentos, aclaraciones) y devuelve los hashes de documentos ya conocidos. Pasa el concurso a `CAPTURADO`. Acepta NOG que no vinieron en el boletín (captura manual). |
| `POST /robot/concursos/:nog/documentos` | `VC.Concurso` | Sube un documento (multipart, campo `archivo`). La API calcula el SHA-256, descarta repetidos (RN-02), clasifica el tipo por el nombre y lo guarda en `STORAGE_DIR`. |
| `GET /robot/notificaciones/resumen` | `VC.Notificador` | Por perfil con destinatarios: oportunidades nuevas sobre el umbral y con cierre vigente (RN-03, RN-04), recordatorios de cierre (`RECORDATORIO_DIAS`, 3 y 1) y documentos por vencer (`AVISO_DOCUMENTOS_DIAS`, 30). |
| `GET /robot/notificaciones/aviso?nog=&tipo=` | `VC.Notificador` | Destinatarios y contenido de un aviso inmediato: `FICHA` (perfiles compatibles) o `CAMBIO` (quienes siguen el concurso). |
| `POST /robot/notificaciones` | `VC.Notificador` | Registra un envío (enviado o fallido). Si fue enviado, marca las oportunidades como notificadas. |
| `GET /robot/expedientes/:nog?perfilId=` · `POST /robot/expedientes` | `VC.Expediente` | Ficha, documentos del concurso y checklist de requisitos contra los documentos de la empresa (vigentes al cierre); registro del expediente armado. |
| `POST /robot/ocds/cargas` · `GET /robot/ocds/cargas/:id` | `VC.Datos` | Inicia la carga OCDS en segundo plano (ADR-0007) y consulta su estado. |

Rutas del dashboard (`/app/*`, sesión JWT): sesión, panel, oportunidades, concursos, perfiles, `historial` (CU-09), `proveedores/:id`, `riesgos`, `riesgos/ranking`, `riesgos/procesos/:ocid` (CU-10), `concursos/:nog/historial` (RF-OCDS-03), `perfiles/:id/telegram` (RF-NOT-02), `ejecuciones` (CU-12, solo administrador; sincroniza los trabajos de Orchestrator) y `concursos/manual` (CU-13, encola un NOG `MANUAL`). Al marcar `PARTICIPARE` en `concursos/:nog/seguimiento`, la API inicia `VC.Expediente` en Orchestrator.

Las rutas `/robot/*` exigen el encabezado `X-Robot-Clave` con el valor de `ROBOT_API_CLAVE` (asset `VC_ApiClave` en Orchestrator).
