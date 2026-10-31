import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los documentos que suben las pruebas no van a storage/
    env: { STORAGE_DIR: path.join(tmpdir(), 'vigia-pruebas-storage') },
    // Comparten la base de desarrollo: guardar una ficha recalcula todos los perfiles, incluidos los de otras pruebas
    fileParallelism: false,
  },
});
