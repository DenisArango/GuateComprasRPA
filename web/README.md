# Dashboard (Angular)

Angular 22 (componentes standalone, sin zone.js, señales) y Angular Material solo para avisos. Consume las rutas `/app/*` de la API con un token JWT.

## Pantallas

| Ruta | Contenido | CU |
| --- | --- | --- |
| `/ingresar` | Inicio de sesión (bloqueo tras 5 intentos fallidos) | — |
| `/panel` | Indicadores, prioridades por fecha de cierre, embudo del boletín y gasto de IA | CU-05 |
| `/oportunidades` | Tabla de vistas abiertas, en seguimiento y todas, con búsqueda | CU-05 |
| `/concursos/:nog` | Ficha de IA, requisitos (lo tienes o falta), desglose del puntaje, documentos, cambios, compras anteriores parecidas (precio de referencia), seguimiento y calificación | CU-05, CU-06, RF-OCDS-03 |
| `/perfil` | Perfil de empresa: categorías, palabras clave, modalidades, departamentos, montos, umbral y documentos con vencimiento | CU-02 |
| `/historial` | Búsqueda en el histórico OCDS por palabra, entidad, proveedor, modalidad y fechas | CU-09 |
| `/proveedores/:id` | Perfil de un proveedor: monto por año, entidades y procesos | CU-09 |
| `/riesgos` | Tablero de banderas rojas: indicadores, procesos por puntaje y ranking de entidades y proveedores, siempre con el aviso | CU-10 |
| `/riesgos/procesos/:ocid` | Evidencia de cada indicador activado en un proceso | CU-10 |

Diseño: ver [DESIGN.md](DESIGN.md).

## Desarrollo

```powershell
$env:Path = "C:\nvm\nvm\v24.18.0;" + $env:Path   # Node 24 (.nvmrc)
npm install
npx ng serve        # http://localhost:4200, proxy de /app a la API en :3000 (proxy.conf.json)
npx ng build        # dist/web
```

Requisitos: la API (`api/`, `npm run dev`) y la base de datos en Docker (`infra/`, `docker compose up -d`). El usuario de desarrollo lo crea `api/src/scripts/seed.ts`.
