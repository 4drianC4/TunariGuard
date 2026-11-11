import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./core/layout/app-shell/app-shell.component').then(m => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      { path: 'inicio', loadComponent: () => import('./features/dashboard/pages/dashboard-page/dashboard-page.component').then(m => m.DashboardPageComponent) },
      { path: 'mapa', loadComponent: () => import('./features/map/pages/map-page/map-page.component').then(m => m.MapPageComponent) },
      { path: 'historial', loadComponent: () => import('./features/history/pages/history-page/history-page.component').then(m => m.HistoryPageComponent) },
      { path: 'armonizacion', loadComponent: () => import('./features/harmonization/pages/harmonization-page/harmonization-page.component').then(m => m.HarmonizationPageComponent) },
      { path: 'alertas', loadComponent: () => import('./features/alerts/pages/alerts-page/alerts-page.component').then(m => m.AlertsPageComponent) },
      { path: 'distritos', loadComponent: () => import('./features/districts/pages/districts-page/districts-page.component').then(m => m.DistrictsPageComponent) },
      { path: 'reportes', loadComponent: () => import('./features/reports/pages/reports-page/reports-page.component').then(m => m.ReportsPageComponent) },
      { path: 'metodologia', loadComponent: () => import('./features/methodology/pages/methodology-page/methodology-page.component').then(m => m.MethodologyPageComponent) },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];