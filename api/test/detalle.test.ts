import { describe, expect, it } from 'vitest';
import { clasificarDocumento, detectarCambios, type DetalleConcurso } from '../src/domain/detalle.js';

const base: DetalleConcurso = {
  titulo: 'Guantes de nitrilo',
  entidad: 'HOSPITAL ROOSEVELT',
  unidadCompradora: null,
  modalidad: 'Cotización',
  estadoGc: 'Vigente',
  montoEstimado: 180000,
  fechaCierre: '2026-11-05T10:00:00',
  documentos: [{ nombre: 'Bases de cotización.pdf', publicadoEn: '2026-10-29' }],
  aclaraciones: 0,
};

describe('clasificarDocumento', () => {
  it.each([
    ['Bases_Cotizacion_2026-15.pdf', 'BASES'],
    ['ADENDA No. 1 a las bases.pdf', 'ADENDA'],
    ['Modificación de fecha.pdf', 'ADENDA'],
    ['Respuestas a preguntas.pdf', 'ACLARACION'],
    ['Especificaciones técnicas.pdf', 'ESPECIFICACIONES'],
    ['Términos de referencia.docx', 'ESPECIFICACIONES'],
    ['32556373@TDR.pdf', 'ESPECIFICACIONES'],
    ['Anexo 3 - Formulario de oferta.docx', 'ANEXO'],
    ['Oficio 125.pdf', 'OTRO'],
  ])('%s → %s', (nombre, tipo) => {
    expect(clasificarDocumento(nombre)).toBe(tipo);
  });
});

describe('detectarCambios', () => {
  it('la primera lectura no genera cambios', () => {
    expect(detectarCambios(null, base)).toEqual([]);
  });

  it('sin diferencias no hay cambios', () => {
    expect(detectarCambios(base, { ...base })).toEqual([]);
  });

  it('detecta adenda, nueva fecha, nuevo estado y aclaraciones', () => {
    const actual: DetalleConcurso = {
      ...base,
      estadoGc: 'Terminado adjudicado',
      fechaCierre: '2026-11-12T10:00:00',
      documentos: [...base.documentos, { nombre: 'Adenda 1.pdf', publicadoEn: '2026-11-02' }],
      aclaraciones: 2,
    };
    expect(detectarCambios(base, actual).map((c) => c.tipo)).toEqual(['ESTADO', 'FECHA', 'DOCUMENTO', 'ACLARACION']);
  });

  it('no cuenta como cambio una diferencia de mayúsculas o tildes en el estado', () => {
    expect(detectarCambios(base, { ...base, estadoGc: 'VIGENTE' })).toEqual([]);
  });

  it('ignora datos que el robot no pudo leer esta vez', () => {
    expect(detectarCambios(base, { ...base, estadoGc: null, fechaCierre: null })).toEqual([]);
  });
});
