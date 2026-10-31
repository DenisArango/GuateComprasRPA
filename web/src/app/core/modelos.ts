/** Tipos de las respuestas de la API del dashboard (api/src/routes/app). */

export type Rol = 'PROVEEDOR' | 'ANALISTA' | 'ADMIN';
export type EstadoSeguimiento = 'SIGUIENDO' | 'PARTICIPARE' | 'DESCARTADO';
export type Etapa = 'PRELIMINAR' | 'COMPLETA';
export type EstadoSistema =
  | 'PRESELECCIONADO' | 'CAPTURADO' | 'TEXTO_EXTRAIDO' | 'ANALIZADO' | 'REVISION_MANUAL'
  | 'NOTIFICADO' | 'CERRADO' | 'FINALIZADO' | 'ERROR_CAPTURA';

export interface Usuario { id: number; correo: string; nombre: string; rol: Rol; }
export interface Sesion { token: string; usuario: Usuario; }
export interface PerfilResumen { id: number; nombre: string; activo: boolean; }

export interface Panel {
  oportunidades: number;
  cierranEstaSemana: number;
  siguiendo: number;
  enRevision: number;
  ia: { gasto30DiasUsd: number; llamadas30Dias: number; presupuestoDiarioUsd: number };
  embudo: { fechaBoletin: string | null; recibidos: number; preseleccionados: number; capturados: number; analizados: number };
}

export interface Oportunidad {
  nog: string;
  titulo: string;
  entidad: string;
  modalidad: string;
  fechaCierre: string | null;
  monto: string | null;
  estado: EstadoSistema | null;
  puntaje: number;
  etapa: Etapa;
  faltantes: string[] | null;
  validadaPor: 'IA' | 'HUMANO' | null;
  seguimiento: EstadoSeguimiento | null;
  calificacion: string | null;
}

export interface Requisito {
  tipo: string;
  descripcion: string;
  documento: string | null;
  obligatorio: boolean;
  referencia: string | null;
  posibleRestrictivo: boolean;
  motivoRestrictivo: string | null;
  cumple: boolean | null;
}

export interface DetalleConcurso {
  nog: string;
  titulo: string;
  entidad: string;
  unidadCompradora: string | null;
  modalidad: string;
  categorias: string[];
  fechaPublicacion: string | null;
  fechaCierre: string | null;
  montoPortal: string | null;
  estado: EstadoSistema | null;
  estadoGc: string | null;
  url: string;
  ficha: {
    resumen: string;
    objeto: string;
    monto: string | null;
    plazoEntrega: string | null;
    lugarEntrega: string | null;
    fechaLimiteOfertas: string | null;
    garantias: { tipo: string; porcentaje: number | null; pagina: number | null }[];
    confianza: number;
    validadaPor: 'IA' | 'HUMANO';
    modeloIa: string;
    costoUsd: number;
    generadoEn: string;
    requisitos: Requisito[];
    criterios: { criterio: string; ponderacion: number | null }[];
  } | null;
  compatibilidad: {
    etapa: Etapa;
    puntaje: number;
    detalle: Record<string, number | string[]>;
    faltantes: string[];
    calificacion: string | null;
  } | null;
  documentos: { id: number; nombreOriginal: string; tipo: string; paginas: number | null; requiereOcr: boolean | null; tamanoBytes: number }[];
  cambios: { tipo: string; antes: unknown; despues: unknown; resumenIa: string | null; detectadoEn: string }[];
  seguimiento: EstadoSeguimiento | null;
  /** Último expediente de oferta armado por VC.Expediente (CU-16) */
  expediente: { ruta: string; faltantes: string[]; generadoEn: string } | null;
}

export interface DocumentoPerfil { documento: string; venceEn: string | null; }

export interface Perfil {
  id: number;
  nombre: string;
  nit: string | null;
  categorias: string[];
  palabrasClave: string[];
  modalidades: string[];
  departamentos: string[];
  montoMin: number | null;
  montoMax: number | null;
  umbralCompatibilidad: number;
  documentos: DocumentoPerfil[];
}

export interface Catalogos {
  categorias: string[];
  documentos: { codigo: string; nombre: string }[];
  modalidades: string[];
  departamentos: string[];
}

// ---------- Histórico OCDS y banderas rojas ----------

export type CodigoIndicador = 'IR-01' | 'IR-02' | 'IR-03' | 'IR-04' | 'IR-05' | 'IR-08';

export interface ProcesoHistorico {
  ocid: string;
  nog: string | null;
  titulo: string;
  entidad: string;
  modalidad: string;
  categoria: string | null;
  fechaPublicacion: string | null;
  estado: string | null;
  numeroOfertas: number | null;
  puntajeRiesgo: number;
  monto: number | null;
  proveedores: { id: number; nombre: string }[];
  indicadores: CodigoIndicador[];
}

export interface PaginaProcesos { total: number; pagina: number; porPagina: number; procesos: ProcesoHistorico[] }

export interface ResumenHistorial {
  procesos: number; proveedores: number; conIndicadores: number;
  desde: string | null; hasta: string | null; ultimaCarga: string | null; fuente: string;
}

export interface FiltrosHistorial {
  buscar?: string; entidad?: string; proveedor?: string; modalidad?: string; indicador?: string;
  desde?: string; hasta?: string; adjudicados?: 'true' | 'false'; pagina?: number;
}

export interface PerfilProveedor {
  id: number; nombre: string; nit: string | null; tipo: string | null;
  totales: { monto: number; procesos: number; entidades: number; desde: string | null; hasta: string | null; conIndicadores: number };
  porAnio: { anio: number; monto: number; procesos: number }[];
  entidades: { entidad: string; monto: number; procesos: number }[];
  procesos: ProcesoHistorico[];
}

export interface Indicador { codigo: CodigoIndicador; nombre: string; fase: string; explicacion: string; peso: number; activados: number }

export interface TableroRiesgos extends PaginaProcesos { aviso: string; indicadores: Indicador[] }

export interface RankingRiesgos {
  aviso: string;
  entidades: { nombre: string; procesos: number; conIndicadores: number }[];
  proveedores: { id: number; nombre: string; procesos: number; conIndicadores: number; monto: number }[];
}

export interface ProcesoRiesgo {
  aviso: string;
  ocid: string; nog: string | null; titulo: string; entidad: string; modalidad: string; categoria: string | null;
  fechaPublicacion: string | null; inicioOfertas: string | null; finOfertas: string | null;
  numeroOfertas: number | null; estado: string | null; puntajeRiesgo: number; urlGuatecompras: string | null;
  indicadores: { codigo: CodigoIndicador; nombre: string; explicacion: string; evidencia: string; peso: number }[];
  adjudicaciones: { proveedorId: number; proveedor: string; nit: string | null; monto: number | null; fecha: string | null; estado: string | null }[];
}

export interface HistorialConcurso { entidad: ProcesoHistorico[]; entidadTotal: number; similares: ProcesoHistorico[] }

/** Avisos por Telegram de un perfil (RF-NOT-02). */
export interface EstadoTelegram {
  disponible: boolean;
  bot: string | null;
  chats: number;
  error?: string | null;
}

/** Bitácora de ejecuciones de los robots (CU-12), sincronizada desde Orchestrator. */
export type EstadoEjecucion = 'EN_CURSO' | 'EXITOSA' | 'PARCIAL' | 'FALLIDA';
export interface Ejecucion {
  id: number;
  proceso: string;
  estado: EstadoEjecucion;
  inicio: string;
  fin: string | null;
  duracionSeg: number | null;
  detalle: {
    idOrchestrator: number; estadoOrchestrator: string; info: string | null; maquina: string | null; origen: string | null;
    enlace: string; metricas: Record<string, number | Record<string, number>>;
  } | null;
}
export interface Bitacora {
  error: string | null;
  resumen: { total: number; exitosas: number; tasa: number | null; procesos: { proceso: string; total: number; exitosas: number; tasa: number }[] };
  relanzables: string[];
  ejecuciones: Ejecucion[];
}
