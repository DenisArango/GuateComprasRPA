import { describe, expect, it } from 'vitest';
import { puntajeRiesgo } from '../src/domain/riesgos.js';
import { fechaUtc, nombreProveedor, normalizarRegistro } from '../src/ocds/normalizar.js';

// Registro compilado de Guatecompras, recortado de los datos reales (OCP Data Registry, publicación 142)
const registro = {
  ocid: 'ocds-xqjsxa-11435909',
  date: '2025-09-12T10:42:09-06:00',
  buyer: { id: 'GT-CISP-11140022', name: 'MINISTERIO PÚBLICO' },
  tender: {
    id: 'GT-NOG-11435909',
    title: '"CONTRATACIÓN DEL SERVICIO DE MANTENIMIENTO   DE EQUIPOS DE BOMBEO"',
    status: 'complete',
    statusDetails: 'Adjudicado',
    datePublished: '2020-02-28T15:12:47-06:00',
    tenderPeriod: { startDate: '2020-02-28T15:12:47-06:00', endDate: '2020-04-27T15:55:38-06:00' },
    procurementMethodDetails: 'Cotización (Art. 38 LCE)',
    mainProcurementCategory: 'services',
    numberOfTenderers: 1,
    items: [{ classification: { id: '72101500' } }, { classification: { id: '72101500' } }],
  },
  parties: [
    { id: 'GT-NIT-7457219', name: 'MENDÓZA,,,EDGAR,BEMBENUTO', roles: ['tenderer', 'supplier'], identifier: { id: '7457219', scheme: 'GT-NIT' }, details: { legalEntityTypeDetail: { description: 'INDIVIDUAL' } } },
    { id: 'GT-NIT-123', name: 'SERVICIOS, S.A.', roles: ['supplier'] },
  ],
  awards: [
    { date: '2020-05-04T10:00:00-06:00', status: 'active', value: { amount: 120000 }, suppliers: [{ id: 'GT-NIT-7457219', name: 'MENDÓZA,,,EDGAR,BEMBENUTO' }] },
    { date: '2020-05-05T10:00:00-06:00', status: 'active', value: { amount: 1000 }, suppliers: [{ id: 'GT-NIT-7457219' }, { id: 'GT-NIT-123', name: 'SERVICIOS, S.A.' }] },
  ],
};

describe('normalización OCDS', () => {
  it('extrae el proceso con NOG, modalidad, plazos y clasificaciones sin repetir', () => {
    const r = normalizarRegistro(registro)!;
    expect(r.proceso).toMatchObject({
      ocid: 'ocds-xqjsxa-11435909', nog: '11435909', comprador_id: 'GT-CISP-11140022', comprador_nombre: 'MINISTERIO PÚBLICO',
      titulo: 'CONTRATACIÓN DEL SERVICIO DE MANTENIMIENTO DE EQUIPOS DE BOMBEO', modalidad: 'Cotización (Art. 38 LCE)',
      categoria: 'services', clasificaciones: ['72101500'], numero_ofertas: 1, estado: 'Adjudicado',
      inicio_ofertas: '2020-02-28T21:12:47.000Z', fin_ofertas: '2020-04-27T21:55:38.000Z',
    });
  });

  it('reparte el monto de un consorcio y ordena el nombre de las personas', () => {
    const r = normalizarRegistro(registro)!;
    expect(r.adjudicaciones.map((a) => [a.identificador, a.monto])).toEqual([['GT-NIT-7457219', 120000], ['GT-NIT-7457219', 500], ['GT-NIT-123', 500]]);
    expect(r.proveedores.find((p) => p.identificador === 'GT-NIT-7457219')).toEqual({ identificador: 'GT-NIT-7457219', nit: '7457219', nombre: 'EDGAR BEMBENUTO MENDÓZA', tipo: 'INDIVIDUAL' });
    expect(nombreProveedor('LÓPEZ,PÉREZ,GARCÍA,ANA,MARÍA')).toBe('ANA MARÍA LÓPEZ PÉREZ DE GARCÍA');
    expect(nombreProveedor('SERVICIOS, S.A.')).toBe('SERVICIOS S.A.');
  });

  it('descarta registros sin ocid o sin tender y fechas inválidas', () => {
    expect(normalizarRegistro({ tender: {} })).toBeNull();
    expect(normalizarRegistro({ ocid: 'x' })).toBeNull();
    expect(fechaUtc('no es fecha')).toBeNull();
  });
});

describe('puntaje compuesto de riesgo', () => {
  it('suma los pesos de los indicadores activados sobre el total (0–100)', () => {
    expect(puntajeRiesgo([])).toBe(0);
    expect(puntajeRiesgo(['IR-01'])).toBe(20);
    expect(puntajeRiesgo(['IR-01', 'IR-01', 'IR-03'])).toBe(35);
    expect(puntajeRiesgo(['IR-01', 'IR-02', 'IR-03', 'IR-04', 'IR-05', 'IR-08'])).toBe(100);
    expect(puntajeRiesgo(['IR-01'], { 'IR-01': 1, 'IR-02': 3 })).toBe(25);
  });
});
