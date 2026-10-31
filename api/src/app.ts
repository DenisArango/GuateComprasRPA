import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { config } from './config.js';
import { rutasAutenticacion } from './routes/app/autenticacion.js';
import { rutasConcursosApp } from './routes/app/concursos.js';
import { rutasHistorialApp } from './routes/app/historial.js';
import { rutasPerfilesApp } from './routes/app/perfiles.js';
import { rutasTelegramApp } from './routes/app/telegram.js';
import { rutasEjecucionesApp } from './routes/app/ejecuciones.js';
import { rutasAnalisis } from './routes/robot/analisis.js';
import { exigirClaveRobot } from './routes/robot/autenticacion.js';
import { rutasBoletin } from './routes/robot/boletin.js';
import { rutasConcursos } from './routes/robot/concursos.js';
import { rutasExpedientes } from './routes/robot/expedientes.js';
import { rutasNotificaciones } from './routes/robot/notificaciones.js';
import { rutasOcds } from './routes/robot/ocds.js';

export function crearApp(opciones: FastifyServerOptions = {}) {
  // El boletín completo pesa ~2 MB en JSON
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024, ...opciones });

  app.get('/salud', async () => ({ estado: 'ok' }));

  // Rutas de los robots: clave de robot (asset VC_ApiClave)
  app.register(async (robot) => {
    robot.addHook('onRequest', exigirClaveRobot(config.ROBOT_API_CLAVE));
    await robot.register(multipart, { limits: { files: 1, fileSize: config.DOCUMENTO_MAX_MB * 1024 * 1024 } });
    await robot.register(rutasBoletin);
    await robot.register(rutasConcursos);
    await robot.register(rutasAnalisis);
    await robot.register(rutasNotificaciones);
    await robot.register(rutasOcds);
    await robot.register(rutasExpedientes);
  });

  // Rutas del dashboard: sesión con JWT
  app.register(async (dashboard) => {
    await dashboard.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: `${config.SESION_HORAS}h` } });
    await dashboard.register(rutasAutenticacion);
    await dashboard.register(rutasConcursosApp);
    await dashboard.register(rutasPerfilesApp);
    await dashboard.register(rutasHistorialApp);
    await dashboard.register(rutasTelegramApp);
    await dashboard.register(rutasEjecucionesApp);
  });

  return app;
}
