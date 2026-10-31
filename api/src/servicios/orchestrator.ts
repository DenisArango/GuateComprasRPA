import { config } from '../config.js';

/**
 * Cliente mínimo de Orchestrator (Automation Cloud) con la External Application de infra/.env.
 * La API no ejecuta robots: encola trabajo y pide a Orchestrator que inicie procesos (CU-12, CU-13).
 */

const ALCANCES = 'OR.Folders OR.Jobs OR.Queues OR.Execution';

let token: { valor: string; vence: number } | null = null;
let carpetaId: number | null = null;

export const orchestratorActivo = () => !!(config.UIPATH_ORG && config.UIPATH_CLIENT_ID && config.UIPATH_CLIENT_SECRET);

const base = () => `${config.UIPATH_URL}/${config.UIPATH_ORG}/${config.UIPATH_TENANT}/orchestrator_`;

async function obtenerToken() {
  if (token && token.vence > Date.now() + 60_000) return token.valor;
  const r = await fetch(`${config.UIPATH_URL}/identity_/connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.UIPATH_CLIENT_ID, client_secret: config.UIPATH_CLIENT_SECRET, scope: ALCANCES }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Orchestrator: no se obtuvo el token (${r.status})`);
  const t = (await r.json()) as { access_token: string; expires_in: number };
  token = { valor: t.access_token, vence: Date.now() + t.expires_in * 1000 };
  return token.valor;
}

async function pedir<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; sinCarpeta?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${await obtenerToken()}`, 'content-type': 'application/json' };
  if (!opciones.sinCarpeta) headers['x-uipath-organizationunitid'] = String(await carpeta());
  const r = await fetch(`${base()}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Orchestrator ${r.status}: ${texto.slice(0, 300)}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

async function carpeta() {
  if (carpetaId) return carpetaId;
  const nombre = encodeURIComponent(config.UIPATH_FOLDER.replace(/'/g, "''"));
  const r = await pedir<{ value: { Id: number }[] }>(`/odata/Folders?$filter=DisplayName eq '${nombre}'`, { sinCarpeta: true });
  if (!r.value[0]) throw new Error(`No existe la carpeta ${config.UIPATH_FOLDER} en Orchestrator`);
  carpetaId = r.value[0].Id;
  return carpetaId;
}

/** Agrega un elemento a una cola (Add Queue Item). */
export async function agregarElementoCola(cola: string, referencia: string, contenido: Record<string, string>, prioridad: 'High' | 'Normal' = 'Normal') {
  return pedir<{ Id: number }>('/odata/Queues/UiPathODataSvc.AddQueueItem', {
    metodo: 'POST',
    cuerpo: { itemData: { Name: cola, Priority: prioridad, Reference: referencia, SpecificContent: contenido } },
  });
}

export interface TrabajoOrchestrator {
  Id: number;
  Key: string;
  ReleaseName: string;
  State: string;
  CreationTime: string;
  StartTime: string | null;
  EndTime: string | null;
  Info: string | null;
  HostMachineName: string | null;
  Source: string | null;
  SourceType: string | null;
  Type: string | null;
}

/** Últimos trabajos de la carpeta (más recientes primero). */
export async function trabajosRecientes(cantidad = 100) {
  const campos = 'Id,Key,ReleaseName,State,CreationTime,StartTime,EndTime,Info,HostMachineName,Source,SourceType,Type';
  const r = await pedir<{ value: TrabajoOrchestrator[] }>(`/odata/Jobs?$orderby=CreationTime desc&$top=${cantidad}&$select=${campos}`);
  return r.value;
}

/** Inicia un proceso desatendido con argumentos de entrada (Start Job). */
export async function iniciarProceso(proceso: string, argumentos: Record<string, unknown> = {}) {
  const nombre = encodeURIComponent(proceso.replace(/'/g, "''"));
  const releases = await pedir<{ value: { Key: string }[] }>(`/odata/Releases?$filter=Name eq '${nombre}'&$select=Key`);
  if (!releases.value[0]) throw new Error(`No existe el proceso ${proceso} en Orchestrator`);
  const r = await pedir<{ value: TrabajoOrchestrator[] }>('/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs', {
    metodo: 'POST',
    cuerpo: {
      startInfo: {
        ReleaseKey: releases.value[0].Key, Strategy: 'ModernJobsCount', JobsCount: 1, RuntimeType: 'Unattended', Source: 'Manual',
        InputArguments: Object.keys(argumentos).length ? JSON.stringify(argumentos) : undefined,
      },
    },
  });
  return r.value[0]!;
}

/** Enlace al trabajo en la interfaz de Orchestrator. */
export const enlaceTrabajo = (id: number) =>
  `${config.UIPATH_URL}/${config.UIPATH_ORG}/${config.UIPATH_TENANT}/orchestrator_/jobs?fid=${carpetaId ?? ''}&tid=${id}`;
