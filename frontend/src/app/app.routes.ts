import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/forbidden/forbidden.component').then(m => m.ForbiddenComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/auth/home-redirect.component').then(m => m.HomeRedirectComponent)
      },
      {
        path: 'recepcion',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
        loadComponent: () => import('./features/recepcion/recepcion.component').then(m => m.RecepcionComponent)
      },
      {
        path: 'caja',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
        loadComponent: () => import('./features/caja/caja.component').then(m => m.CajaComponent)
      },
      {
        path: 'facturas',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
        loadComponent: () => import('./features/facturas/facturas.component').then(m => m.FacturasComponent)
      },
      {
        path: 'inventario',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
        loadComponent: () => import('./features/inventario/inventario.component').then(m => m.InventarioComponent)
      },
      {
        path: 'administracion',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR'] },
        loadComponent: () => import('./features/administracion/administracion.component').then(m => m.AdministracionComponent)
      },
      {
        path: 'dashboard',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR'] },
        loadComponent: () => import('./features/dashboard-bi/dashboard-bi.component').then(m => m.DashboardBiComponent)
      },
      {
        path: 'mis-recetas',
        canActivate: [roleGuard],
        data: { roles: ['MEDICO', 'PACIENTE'] },
        loadComponent: () => import('./features/mis-recetas/mis-recetas.component').then(m => m.MisRecetasComponent)
      },
      {
        path: 'mis-facturas',
        canActivate: [roleGuard],
        data: { roles: ['PACIENTE'] },
        loadComponent: () => import('./features/mis-facturas/mis-facturas.component').then(m => m.MisFacturasComponent)
      },
      {
        path: 'citas',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'] },
        loadComponent: () => import('./features/citas/citas.component').then(m => m.CitasComponent)
      },
      {
        path: 'historia',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'MEDICO'] },
        loadComponent: () => import('./features/historia/historia.component').then(m => m.HistoriaComponent)
      },
      {
        path: 'diagnostico',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'MEDICO'] },
        loadComponent: () => import('./features/diagnostico/diagnostico.component').then(m => m.DiagnosticoComponent)
      },
      {
        path: 'documentos',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'] },
        loadComponent: () => import('./features/documentos/documentos.component').then(m => m.DocumentosComponent)
      },
      {
        path: 'pre-triaje',
        canActivate: [roleGuard],
        data: { roles: ['PACIENTE'] },
        loadComponent: () => import('./features/pre-triaje/pre-triaje.component').then(m => m.PreTriajeComponent)
      },
      {
        path: 'reportes',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] },
        loadComponent: () => import('./features/reportes/reportes.component').then(m => m.ReportesComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
