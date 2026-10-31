import { describe, expect, it } from 'vitest';
import { calcularCompatibilidad, faltantes, type PerfilCompatibilidad } from '../src/domain/compatibilidad.js';
import type { Ficha } from '../src/domain/ficha.js';

const hoy = new Date(2026, 9, 30);

const ficha: Ficha = {
  resumen: 'Compra de guantes. Monto Q180,000. Cierra el 5 de noviembre.',
  objeto: 'Guantes de nitrilo talla M',
  items: [{ descripcion: 'Guantes de nitrilo sin polvo', cantidad: 5000, unidad: 'caja' }],
  montoEstimado: 180000,
  moneda: 'GTQ',
  fechaLimiteOfertas: '2026-11-05T10:00:00',
  plazoEntrega: null,
  lugarEntrega: 'Bodega central, zona 11, Guatemala',
  requisitos: [
    { tipo: 'legal', descripcion: 'RGAE', documento: 'RGAE', obligatorio: true, pagina: 3, posibleRestrictivo: false, motivoRestrictivo: null },
    { tipo: 'legal', descripcion: 'RTU', documento: 'RTU', obligatorio: true, pagina: 3, posibleRestrictivo: false, motivoRestrictivo: null },
    { tipo: 'tecnico', descripcion: 'Carta de distribuidor', documento: 'CARTA_DISTRIBUIDOR', obligatorio: true, pagina: 3, posibleRestrictivo: true, motivoRestrictivo: 'Marca única' },
    { tipo: 'otro', descripcion: 'Muestras', documento: null, obligatorio: true, pagina: 4, posibleRestrictivo: false, motivoRestrictivo: null },
  ],
  garantias: [],
  criteriosCalificacion: [{ criterio: 'Precio', ponderacion: 100, pagina: 4 }],
  formaPago: null,
  observaciones: [],
};

const perfil: PerfilCompatibilidad = {
  id: 1,
  categorias: ['Salud e insumos hospitalarios'],
  palabrasClave: ['guante', 'nitrilo', 'jeringa'],
  departamentos: ['Guatemala'],
  montoMin: 50000,
  montoMax: 500000,
  documentos: [
    { documento: 'RGAE', venceEn: null },
    { documento: 'RTU', venceEn: new Date(2026, 9, 1) }, // vencido
  ],
};

const concurso = { titulo: 'Adquisición de guantes', categorias: ['Salud e insumos hospitalarios'], montoPortal: 180000, fechaCierre: new Date(2026, 10, 5) };

describe('faltantes (RN-09)', () => {
  it('lista los obligatorios sin documento vigente e ignora los que no son documentos', () => {
    expect(faltantes(ficha, perfil, hoy)).toEqual(['RTU', 'CARTA_DISTRIBUIDOR']);
  });
});

describe('calcularCompatibilidad', () => {
  it('suma los componentes con sus pesos', () => {
    const r = calcularCompatibilidad(ficha, concurso, perfil, hoy);
    expect(r.detalle).toMatchObject({ categoria: 1, contenido: 1, departamento: 1, monto: 1 });
    expect(r.detalle.requisitos).toBeCloseTo(1 / 3);
    expect(r.puntaje).toBe(Math.round(25 + 30 + 10 + 15 + 20 / 3));
    expect(r.faltantes).toEqual(['RTU', 'CARTA_DISTRIBUIDOR']);
  });

  it('un monto fuera del rango baja en proporción y sin dato es neutro', () => {
    expect(calcularCompatibilidad({ ...ficha, montoEstimado: 1_000_000 }, concurso, perfil, hoy).detalle.monto).toBe(0);
    expect(calcularCompatibilidad({ ...ficha, montoEstimado: 40000 }, concurso, perfil, hoy).detalle.monto).toBeCloseTo(0.8);
    expect(calcularCompatibilidad({ ...ficha, montoEstimado: null }, { ...concurso, montoPortal: null }, perfil, hoy).detalle.monto).toBe(0.5);
  });

  it('sin requisitos documentales, la empresa cumple', () => {
    expect(calcularCompatibilidad({ ...ficha, requisitos: [] }, concurso, perfil, hoy).detalle.requisitos).toBe(1);
  });
});
