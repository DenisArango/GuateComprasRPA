import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esquemaFicha } from '../domain/ficha.js';

/** Copia el JSON Schema de la ficha a rpa/fixtures (pruebas de VC.Analisis sin la API). */
const destino = fileURLToPath(new URL('../../../rpa/fixtures/esquema-ficha.json', import.meta.url));
writeFileSync(destino, JSON.stringify(esquemaFicha(), null, 2) + '\n');
console.log(`Esquema exportado a ${destino}`);
