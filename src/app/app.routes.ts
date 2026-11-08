
import { Routes } from '@angular/router';

import { AppShell } from './layout/app-shell/app-shell';
import { Dashboard } from './features/dashboard/pages/dashboard/dashboard';

import { authGuard } from './core/auth/guards/auth.guard';
import { guestGuard } from './core/auth/guards/guest.guard';
import { platformGuard } from './core/auth/guards/platform.guard';

// =========================================================
// Workspace Route Scope
// =========================================================

/**
 * Defines the workspace context required by a route.
 *
 * platform:
 *   Platform administration context.
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
export type WorkspaceRouteScope =
  'platform' | 'company' | 'branch';

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
  // Invitation Acceptance
  // =======================================================

  /**
   * Allows invited users to accept invitations.
   *
   * New users:
   *   Accept invitation and establish a password.
   *
   * Existing users:
   *   Accept invitation using their authenticated
   *   identity.
   *
   * This route is intentionally outside AppShell.
   *
   * Do not apply authGuard or guestGuard here.
   *
   * Backend must validate invitation tokens,
   * expiration, identity and authorization.
   */
  {
    path: 'invitations/accept',

    loadComponent: () =>
      import(
        './features/auth/accept-invitation/accept-invitation'
      )
        .then(m => m.AcceptInvitation),

    title: 'Accept Invitation | iPOS'
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
      // Platform Administration
      // ===================================================

      {
        path: 'platform',

        loadComponent: () =>
          import('./features/platform/platform-dashboard')
            .then(m => m.PlatformDashboard),

        canActivate: [
          platformGuard
        ],

        data: {
          workspaceScope: 'platform' satisfies WorkspaceRouteScope
        },

        title: 'Platform Administration | iPOS'
      },

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
      // Organization / Company Management
      // ===================================================

      {
        path: 'settings/organization/company-management',

        loadComponent: () =>
          import(
            './features/settings/organization/company-management/pages/company-management/company-management'
          )
            .then(m => m.CompanyManagement),

        canActivate: [
          platformGuard
        ],

        data: {
          workspaceScope: 'platform' satisfies WorkspaceRouteScope
        },

        title: 'Company Management | iPOS'
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
      },

      // ===================================================
      // Organization / POS Counter Management
      // ===================================================

      {
        path: 'settings/organization/pos-counter-management',

        loadComponent: () =>
          import(
            './features/settings/organization/pos-counter-management/pages/pos-counter-management/pos-counter-management'
          )
            .then(m => m.PosCounterManagement),

        data: {
          workspaceScope: 'branch' satisfies WorkspaceRouteScope
        },

        title: 'POS Counter Management | iPOS'
      },

      // ===================================================
      // Organization / Warehouse Management
      // ===================================================

      {
        path: 'settings/organization/warehouse-management',

        loadComponent: () =>
          import(
            './features/settings/organization/warehouse-management/pages/warehouse-management/warehouse-management'
          )
            .then(m => m.WarehouseManagement),

        data: {
          workspaceScope: 'branch' satisfies WorkspaceRouteScope
        },

        title: 'Warehouse Management | iPOS'
      },

      // ===================================================
      // Users & Access Control / User Management
      // ===================================================

      {
        path: 'settings/users-access-control/user-management',

        loadComponent: () =>
          import(
            './features/settings/users-access-control/user-management/pages/user-management/user-management'
          )
            .then(m => m.UserManagement),

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Users Management | iPOS'
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