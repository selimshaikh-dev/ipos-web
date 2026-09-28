import { Routes } from '@angular/router';

import { AppShell } from './layout/app-shell/app-shell';
import { Dashboard } from './features/dashboard/pages/dashboard/dashboard';

import { authGuard } from './core/auth/guards/auth.guard';
import { guestGuard } from './core/auth/guards/guest.guard';

export const routes: Routes = [

  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },


  {
    path: 'login',

    loadComponent: () =>
      import('./features/auth/login/login')
        .then(m => m.Login),

    canActivate: [
      guestGuard
    ],

    title: 'Sign In | iPOS'
  },


  {
    path: '',

    component: AppShell,

    canActivate: [
      authGuard
    ],

    children: [

      {
        path: 'dashboard',

        component: Dashboard,

        title: 'Dashboard | iPOS'
      },

      {
        path: 'settings/organization/company-profile',

        loadComponent: () =>
          import(
            './features/settings/organization/company-profile/pages/company-profile/company-profile'
          )
            .then(m => m.CompanyProfile),

        title: 'Company Profile | iPOS'
      }

    ]
  },

  {
    path: '**',
    redirectTo: 'login'
  }

];