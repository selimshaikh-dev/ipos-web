import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell/app-shell';
import { Dashboard } from './features/dashboard/pages/dashboard/dashboard';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        component: Dashboard,
        title: 'Dashboard | iPOS'
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];