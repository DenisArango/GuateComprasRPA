import type { Routes } from '@angular/router';
import { requiereSesion } from './core/sesion';

export const routes: Routes = [
  { path: 'ingresar', title: 'Ingresar · Vigía', loadComponent: () => import('./paginas/ingresar').then((m) => m.Ingresar) },
  {
    path: '',
    canActivate: [requiereSesion],
    loadComponent: () => import('./compartido/marco').then((m) => m.Marco),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'panel' },
      { path: 'panel', title: 'Panel · Vigía', loadComponent: () => import('./paginas/panel').then((m) => m.PanelPagina) },
      { path: 'oportunidades', title: 'Oportunidades · Vigía', loadComponent: () => import('./paginas/oportunidades').then((m) => m.Oportunidades) },
      { path: 'concursos/:nog', title: 'Concurso · Vigía', loadComponent: () => import('./paginas/concurso').then((m) => m.ConcursoPagina) },
      { path: 'perfil', title: 'Perfil de empresa · Vigía', loadComponent: () => import('./paginas/perfil').then((m) => m.PerfilPagina) },
      { path: 'historial', title: 'Historial · Vigía', loadComponent: () => import('./paginas/historial').then((m) => m.HistorialPagina) },
      { path: 'proveedores/:id', title: 'Proveedor · Vigía', loadComponent: () => import('./paginas/proveedor').then((m) => m.ProveedorPagina) },
      { path: 'riesgos', title: 'Banderas rojas · Vigía', loadComponent: () => import('./paginas/riesgos').then((m) => m.RiesgosPagina) },
      { path: 'ejecuciones', title: 'Ejecuciones · Vigía', loadComponent: () => import('./paginas/ejecuciones').then((m) => m.EjecucionesPagina) },
      { path: 'riesgos/procesos/:ocid', title: 'Proceso · Vigía', loadComponent: () => import('./paginas/proceso-riesgo').then((m) => m.ProcesoRiesgoPagina) },
    ],
  },
  { path: '**', redirectTo: '' },
];
