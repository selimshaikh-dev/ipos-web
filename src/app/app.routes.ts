
import { Routes } from '@angular/router';

import { AppShell } from './layout/app-shell/app-shell';
import { Dashboard } from './features/dashboard/pages/dashboard/dashboard';

import { authGuard } from './core/auth/guards/auth.guard';
import { guestGuard } from './core/auth/guards/guest.guard';

// =========================================================
// Workspace Route Scope
// =========================================================

/**
 * Defines the workspace context required by a route.
 *
 * company:
 *   Requires an authorized company.
 *
 * branch:
 *   Requires an authorized company and a selected
 *   authorized branch.
 *
 * Route metadata is not an authorization mechanism.
 * Guards and backend policies must enforce access.
 */
export type WorkspaceRouteScope = 'company' | 'branch';

// =========================================================
// Application Routes
// =========================================================

export const routes: Routes = [

  // =======================================================
  // Default Route
  // =======================================================

  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },

  // =======================================================
  // Guest Routes
  // =======================================================

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

  // =======================================================
  // Authenticated Application Shell
  // =======================================================

  {
    path: '',

    component: AppShell,

    canActivate: [
      authGuard
    ],

    children: [

      // ===================================================
      // Dashboard
      // ===================================================

      {
        path: 'dashboard',

        component: Dashboard,

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Dashboard | iPOS'
      },

      // ===================================================
      // Organization / Company Profile
      // ===================================================

      {
        path: 'settings/organization/company-profile',

        loadComponent: () =>
          import(
            './features/settings/organization/company-profile/pages/company-profile/company-profile'
          )
            .then(m => m.CompanyProfile),

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Company Profile | iPOS'
      },

      // ===================================================
      // Organization / Branch Management
      // ===================================================

      {
        path: 'settings/organization/branch-management',

        loadComponent: () =>
          import(
            './features/settings/organization/branch-management/pages/branch-management/branch-management'
          )
            .then(m => m.BranchManagement),

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Branch Management | iPOS'
      }

    ]
  },

  // =======================================================
  // Fallback Route
  // =======================================================

  {
    path: '**',
    redirectTo: 'login'
  }

];