import { crearApp } from './app.js';
import { config } from './config.js';

const app = crearApp({ logger: true });

try {
  // '::' escucha en IPv6 e IPv4 (localhost resuelve a ::1 en Windows) y acepta robots de otras máquinas
  await app.listen({ port: config.PORT, host: '::' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
