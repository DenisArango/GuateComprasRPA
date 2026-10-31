import { describe, expect, it } from 'vitest';
import { estadoDeTrabajo, tasaDeExito } from '../src/servicios/ejecuciones.js';

describe('bitácora de ejecuciones (CU-12)', () => {
  it('traduce los estados de Orchestrator', () => {
    expect(estadoDeTrabajo('Successful')).toBe('EXITOSA');
    expect(estadoDeTrabajo('Faulted')).toBe('FALLIDA');
    expect(estadoDeTrabajo('Stopped')).toBe('PARCIAL');
    expect(estadoDeTrabajo('Running')).toBe('EN_CURSO');
    expect(estadoDeTrabajo('Pending')).toBe('EN_CURSO');
  });

  it('calcula la tasa de éxito sin contar las que siguen en curso', () => {
    const r = tasaDeExito([
      { proceso: 'VC.Captura', estado: 'EXITOSA' },
      { proceso: 'VC.Captura', estado: 'EXITOSA' },
      { proceso: 'VC.Analisis', estado: 'FALLIDA' },
      { proceso: 'VC.Analisis', estado: 'EXITOSA' },
      { proceso: 'VC.Notificador', estado: 'EN_CURSO' },
    ]);
    expect(r).toMatchObject({ total: 4, exitosas: 3, tasa: 75 });
    expect(r.procesos).toEqual([
      { proceso: 'VC.Captura', total: 2, exitosas: 2, tasa: 100 },
      { proceso: 'VC.Analisis', total: 2, exitosas: 1, tasa: 50 },
    ]);
    expect(tasaDeExito([]).tasa).toBeNull();
  });
});
