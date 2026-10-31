import { describe, expect, it } from 'vitest';
import { preseleccionar, puntuar, type ConcursoBoletin, type PerfilPreseleccion } from '../src/domain/preseleccion.js';
import { normalizar, palabrasEncontradas } from '../src/domain/texto.js';

const hoy = new Date(2026, 9, 30);

const perfil: PerfilPreseleccion = {
  id: 1,
  categorias: ['Salud e insumos hospitalarios'],
  palabrasClave: ['guante', 'jeringa', 'nitrilo'],
  modalidades: ['Cotización', 'Licitación'],
};

function concurso(parcial: Partial<ConcursoBoletin>): ConcursoBoletin {
  return {
    nog: '1',
    fechaCierre: new Date(2026, 10, 5),
    modalidad: 'Cotización (Art. 38 LCE)',
    categorias: ['Salud e insumos hospitalarios'],
    descripcion: 'Adquisición de guantes de nitrilo para el hospital',
    ...parcial,
  };
}

describe('texto', () => {
  it('normaliza tildes, mayúsculas y espacios', () => {
    expect(normalizar('  ADQUISICIÓN   de Jeringas ')).toBe('adquisicion de jeringas');
  });

  it('encuentra palabras clave al inicio de palabra', () => {
    expect(palabrasEncontradas('Compra de GUANTES quirúrgicos', ['guante'])).toEqual(['guante']);
    expect(palabrasEncontradas('Servicio de crédito', ['red'])).toEqual([]);
  });
});

describe('puntuar', () => {
  it('categoría y dos palabras clave dan el puntaje más alto', () => {
    expect(puntuar(concurso({}), perfil, hoy)).toMatchObject({ puntaje: 100, detalle: { palabras: ['guante', 'nitrilo'] } });
  });

  it('la categoría sola no alcanza el umbral (descarta alimentos de hospitales)', () => {
    expect(puntuar(concurso({ descripcion: 'Adquisición de papayas y piña para el hospital' }), perfil, hoy)).toBeNull();
  });

  it('una palabra clave basta aunque la categoría no coincida', () => {
    const r = puntuar(concurso({ categorias: ['Otros tipos de bienes o servicios'], descripcion: 'Jeringas descartables' }), perfil, hoy);
    expect(r?.puntaje).toBe(50);
  });

  it('descarta modalidades que el perfil no acepta', () => {
    expect(puntuar(concurso({ modalidad: 'Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)' }), perfil, hoy)).toBeNull();
  });

  it('acepta todas las modalidades si el perfil no indica ninguna', () => {
    const r = puntuar(concurso({ modalidad: 'Compra Directa con Oferta Electrónica' }), { ...perfil, modalidades: [] }, hoy);
    expect(r).not.toBeNull();
  });

  it('descarta concursos con cierre vencido (RN-04), pero no los que cierran hoy', () => {
    expect(puntuar(concurso({ fechaCierre: new Date(2026, 9, 29) }), perfil, hoy)).toBeNull();
    expect(puntuar(concurso({ fechaCierre: new Date(2026, 9, 30) }), perfil, hoy)).not.toBeNull();
  });
});

describe('preseleccionar', () => {
  it('ordena por puntaje y aplica el tope diario', () => {
    const concursos = [
      concurso({ nog: 'a', descripcion: 'Jeringas' }),
      concurso({ nog: 'b' }),
      concurso({ nog: 'c', descripcion: 'Papayas' }),
    ];
    const candidatos = preseleccionar(concursos, [perfil], hoy, 1);
    expect(candidatos.map((c) => c.nog)).toEqual(['b']);
  });

  it('usa el mejor puntaje entre perfiles', () => {
    const otro: PerfilPreseleccion = { id: 2, categorias: [], palabrasClave: ['jeringa'], modalidades: [] };
    const [c] = preseleccionar([concurso({ descripcion: 'Jeringas' })], [perfil, otro], hoy, 10);
    expect(c?.puntaje).toBe(90);
    expect(c?.resultados.map((r) => r.perfilId)).toEqual([1, 2]);
  });
});
