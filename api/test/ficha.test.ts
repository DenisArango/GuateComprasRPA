import { describe, expect, it } from 'vitest';
import { calcularConfianza, paginasDeTexto } from '../src/domain/confianza.js';
import { esquemaFicha, validarFicha, type Ficha } from '../src/domain/ficha.js';

const ficha: Ficha = {
  resumen: 'El Hospital Roosevelt compra guantes de nitrilo. El monto estimado es de Q180,000. Las ofertas se reciben hasta el 5 de noviembre. Se exige carta de distribuidor autorizado.',
  objeto: 'Guantes de nitrilo',
  items: [{ descripcion: 'Guantes de nitrilo talla M', cantidad: 5000, unidad: 'caja' }],
  montoEstimado: 180000,
  moneda: 'GTQ',
  fechaLimiteOfertas: '2026-11-05T10:00:00',
  plazoEntrega: '15 días',
  lugarEntrega: 'Bodega del hospital',
  requisitos: [
    { tipo: 'legal', descripcion: 'Constancia de inscripción en el RGAE', documento: 'RGAE', obligatorio: true, pagina: 4, posibleRestrictivo: false, motivoRestrictivo: null },
    { tipo: 'tecnico', descripcion: 'Carta de distribuidor autorizado', documento: 'CARTA_DISTRIBUIDOR', obligatorio: true, pagina: 9, posibleRestrictivo: false, motivoRestrictivo: null },
  ],
  garantias: [{ tipo: 'Seguro de caución de sostenimiento', porcentaje: 5, pagina: 4 }],
  criteriosCalificacion: [{ criterio: 'Precio', ponderacion: 80, pagina: 6 }],
  formaPago: null,
  observaciones: [],
};

const paginas = paginasDeTexto(
  '[p. 4] Requisitos: constancia de inscripción en el RGAE. Seguro de caución de sostenimiento del 5 %. ' +
  '[p. 6] Criterios de calificación: precio 80 puntos. [p. 7] Plazo de entrega.',
);

describe('validarFicha', () => {
  it('acepta una ficha válida', () => {
    expect(validarFicha(ficha).ok).toBe(true);
  });

  it('devuelve errores legibles para reenviar a la IA', () => {
    const r = validarFicha({ ...ficha, moneda: 'USD', campoExtra: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/moneda/);
  });

  it('exige el motivo cuando un requisito es posiblemente restrictivo', () => {
    const r = validarFicha({ ...ficha, requisitos: [{ ...ficha.requisitos[0], posibleRestrictivo: true }] });
    expect(r.ok).toBe(false);
  });

  it('publica un JSON Schema de objetos cerrados', () => {
    const esquema = esquemaFicha() as { additionalProperties?: boolean; required?: string[] };
    expect(esquema.additionalProperties).toBe(false);
    expect(esquema.required).toContain('requisitos');
  });
});

describe('calcularConfianza', () => {
  it('ficha coherente con el portal y con citas verificables', () => {
    const { confianza, componentes } = calcularConfianza(ficha, { fechaCierre: '2026-11-05', montoEstimado: 180000 }, paginas);
    expect(componentes).toMatchObject({ fecha: 1, monto: 1, completitud: 1 });
    expect(componentes.paginas).toBe(0.75); // la página 9 no existe en el texto
    expect(confianza).toBe(0.93);
  });

  it('una fecha distinta a la del portal baja la confianza bajo el umbral 0.7', () => {
    const { confianza } = calcularConfianza({ ...ficha, fechaLimiteOfertas: '2026-11-15T10:00:00', requisitos: [] }, { fechaCierre: '2026-11-05', montoEstimado: 180000 }, paginas);
    expect(confianza).toBeLessThan(0.7);
  });

  it('si las bases no traen fecha, la fecha no cuenta como error', () => {
    const { componentes } = calcularConfianza({ ...ficha, fechaLimiteOfertas: null }, { fechaCierre: '2026-11-05', montoEstimado: 180000 }, paginas);
    expect(componentes.fecha).toBeUndefined();
  });

  it('las citas a páginas escaneadas (sin texto) no se pueden verificar y se excluyen', () => {
    const escaneado = paginasDeTexto(Array.from({ length: 10 }, (_, i) => `[p. ${i + 1}] `).join(''));
    const { confianza, componentes } = calcularConfianza({ ...ficha, fechaLimiteOfertas: null, montoEstimado: null }, { fechaCierre: '2026-11-05', montoEstimado: null }, escaneado);
    expect(componentes).toEqual({ completitud: 1 });
    expect(confianza).toBe(0.5); // solo completitud: no se da por buena sin revisión
  });

  it('sin monto en el portal, ese componente no cuenta', () => {
    const { componentes } = calcularConfianza(ficha, { fechaCierre: '2026-11-05', montoEstimado: null }, paginas);
    expect(componentes.monto).toBeUndefined();
  });
});
