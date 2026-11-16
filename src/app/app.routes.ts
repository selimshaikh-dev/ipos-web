import { Routes } from '@angular/router';

import { AppShell } from './layout/app-shell/app-shell';
import { Dashboard } from './features/dashboard/pages/dashboard/dashboard';

import { authGuard } from './core/auth/guards/auth.guard';
import { guestGuard } from './core/auth/guards/guest.guard';
import { platformGuard } from './core/auth/guards/platform.guard';
import { permissionGuard } from './core/authorization/permission.guard';

export type WorkspaceRouteScope =
  'platform' | 'company' | 'branch';

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
    path: 'invitations/accept',

    loadComponent: () =>
      import(
        './features/auth/accept-invitation/accept-invitation'
      )
        .then(m => m.AcceptInvitation),

    title: 'Accept Invitation | iPOS'
  },

  {
    path: 'workspace',

    component: AppShell,

    canActivate: [
      authGuard
    ],

    data: {
      workspaceScope: 'company' satisfies WorkspaceRouteScope
    },

    title: 'Workspace Selection | iPOS'
  },

  {
    path: '',

    component: AppShell,

    canActivate: [
      authGuard
    ],

    children: [

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

      {
        path: 'dashboard',

        component: Dashboard,

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Dashboard | iPOS'
      },

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

      {
        path: 'settings/organization/branch-management',

        loadComponent: () =>
          import(
            './features/settings/organization/branch-management/pages/branch-management/branch-management'
          )
            .then(m => m.BranchManagement),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Branch Management | iPOS'
      },

      {
        path: 'settings/organization/pos-counter-management',

        loadComponent: () =>
          import(
            './features/settings/organization/pos-counter-management/pages/pos-counter-management/pos-counter-management'
          )
            .then(m => m.PosCounterManagement),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'branch' satisfies WorkspaceRouteScope
        },

        title: 'POS Counter Management | iPOS'
      },

      {
        path: 'settings/organization/warehouse-management',

        loadComponent: () =>
          import(
            './features/settings/organization/warehouse-management/pages/warehouse-management/warehouse-management'
          )
            .then(m => m.WarehouseManagement),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'branch' satisfies WorkspaceRouteScope
        },

        title: 'Warehouse Management | iPOS'
      },

      {
        path: 'settings/catalog/units-of-measurement',

        loadComponent: () =>
          import(
            './features/settings/catalog/units-of-measurement/pages/units-of-measurement/units-of-measurement'
          )
            .then(m => m.UnitsOfMeasurement),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Units of Measurement | iPOS'
      },

      {
        path: 'settings/users-access-control/user-management',

        loadComponent: () =>
          import(
            './features/settings/users-access-control/user-management/pages/user-management/user-management'
          )
            .then(m => m.UserManagement),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Users Management | iPOS'
      },

      {
        path: 'settings/users-access-control/role-management',

        loadComponent: () =>
          import(
            './features/settings/users-access-control/role-management/pages/role-management/role-management'
          )
            .then(m => m.RoleManagement),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Roles & Permissions | iPOS'
      },

      {
        path: 'settings/users-access-control/company-branch-access',

        loadComponent: () =>
          import(
            './features/settings/users-access-control/company-branch-access/pages/company-branch-access/company-branch-access'
          )
            .then(m => m.CompanyBranchAccess),

        canActivate: [
          permissionGuard
        ],

        data: {
          workspaceScope: 'company' satisfies WorkspaceRouteScope
        },

        title: 'Company / Branch Access | iPOS'
      }

    ]
  },

  {
    path: '**',
    redirectTo: 'login'
  }

];