import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Las variables viven en infra/.env (compartido con Docker Compose); ver infra/.env.example.
dotenv.config({ path: fileURLToPath(new URL('../../infra/.env', import.meta.url)), quiet: true });

const Config = z.object({
  DATABASE_URL: z.string().default('postgresql://vigia:vigia@localhost:5433/vigia'),
  PORT: z.coerce.number().int().default(3000),
  ROBOT_API_CLAVE: z.string().min(20),
  /// Máximo de candidatos que la preselección manda por día al robot atendido (ADR-0006)
  PRESELECCION_MAX_DIARIO: z.coerce.number().int().positive().default(50),
  /// Carpeta de los documentos descargados (excluida de Git)
  STORAGE_DIR: z.string().default(fileURLToPath(new URL('../../storage', import.meta.url))),
  DOCUMENTO_MAX_MB: z.coerce.number().positive().default(100),
  IA_PRESUPUESTO_DIARIO_USD: z.coerce.number().positive().default(2),
  /// Bajo este valor la ficha pasa a validación humana (Action Center)
  FICHA_UMBRAL_CONFIANZA: z.coerce.number().min(0).max(1).default(0.7),
  /// Firma de las sesiones del dashboard. Vacía en desarrollo: se genera una al arrancar (las sesiones no sobreviven reinicios)
  JWT_SECRET: z.string().default(''),
  SESION_HORAS: z.coerce.number().positive().default(8),
  /// Dirección del dashboard para los enlaces de los correos
  WEB_URL: z.string().default('http://localhost:4200'),
  /// Días antes del cierre en que se recuerda un concurso en seguimiento (RF-NOT-04)
  RECORDATORIO_DIAS: z.string().default('3,1').transform((v) => v.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0)),
  /// Aviso de documentos de la empresa que vencen dentro de estos días
  AVISO_DOCUMENTOS_DIAS: z.coerce.number().int().positive().default(30),
  /// Bot de Telegram (@BotFather). Vacío: el dashboard no ofrece vincular Telegram
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  /// Orchestrator (External Application): la API encola NOG manuales, consulta trabajos y los inicia (CU-12, CU-13)
  UIPATH_URL: z.string().default('https://cloud.uipath.com'),
  UIPATH_ORG: z.string().default(''),
  UIPATH_TENANT: z.string().default('DefaultTenant'),
  UIPATH_CLIENT_ID: z.string().default(''),
  UIPATH_CLIENT_SECRET: z.string().default(''),
  UIPATH_FOLDER: z.string().default('Shared'),
});

const leida = Config.parse(process.env);
export const config = { ...leida, JWT_SECRET: leida.JWT_SECRET || randomBytes(32).toString('hex') };
