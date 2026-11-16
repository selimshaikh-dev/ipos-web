
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import {
  CanActivateFn,
  Router,
  RouterStateSnapshot
} from '@angular/router';

import {
  catchError,
  map,
  of,
  take
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/services/auth.service';
import { WorkspaceContextService } from '../workspace/services/workspace-context.service';
import { getRoutePermission } from './permission-registry';

interface EffectivePermissionsResponse {
  companyId: number;
  branchId: number | null;
  scope: 'company' | 'branch';
  permissionCodes: string[];
}

export const permissionGuard: CanActivateFn = (
  route,
  state: RouterStateSnapshot
) => {

  const http = inject(HttpClient);
  const router = inject(Router);
  const auth = inject(AuthService);

  const workspace =
    inject(WorkspaceContextService);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const path =
    state.url.split(/[?#]/, 1)[0]
      .replace(/\/+$/, '') || '/';

  const routeScope =
    route.data['workspaceScope'];

  const isDashboard =
    path === '/dashboard';

  const requirement =
    getRoutePermission(path);

  if (!isDashboard && requirement === null) {
    return false;
  }

  if (
    routeScope !== 'company' &&
    routeScope !== 'branch'
  ) {
    return false;
  }

  if (
    requirement !== null &&
    requirement.scope !== routeScope
  ) {
    return false;
  }

  if (
    isDashboard &&
    routeScope !== 'company'
  ) {
    return false;
  }

  if (
    !workspace.isInitialized() ||
    workspace.companyId() === null
  ) {

    return router.createUrlTree([
      '/workspace'
    ]);

  }

  const companyId =
    workspace.companyId();

  if (
    companyId === null ||
    companyId <= 0
  ) {
    return false;
  }

  const branchId =
    workspace.branchId();

  if (
    routeScope === 'branch' &&
    (
      branchId === null ||
      branchId <= 0
    )
  ) {

    return router.createUrlTree([
      '/dashboard'
    ]);

  }

  const expectedBranchId =
    routeScope === 'branch'
      ? branchId
      : null;

  const url =
    expectedBranchId === null
      ? `${environment.apiBaseUrl}/companies/${companyId}/authorization/effective-permissions`
      : `${environment.apiBaseUrl}/companies/${companyId}/authorization/branches/${expectedBranchId}/effective-permissions`;

  return http
    .get<EffectivePermissionsResponse>(url)
    .pipe(

      take(1),

      map(response => {

        if (
          !auth.isAuthenticated() ||
          !workspace.isInitialized() ||
          workspace.companyId() !== companyId ||
          (
            routeScope === 'branch' &&
            workspace.branchId() !== expectedBranchId
          )
        ) {
          return false;
        }

        if (
          !response ||
          response.companyId !== companyId ||
          response.branchId !== expectedBranchId ||
          response.scope !== routeScope ||
          !Array.isArray(response.permissionCodes)
        ) {
          return false;
        }

        if (
          !response.permissionCodes.every(
            code => typeof code === 'string'
          )
        ) {
          return false;
        }

        if (isDashboard) {
          return true;
        }

        return (
          requirement !== null &&
          response.permissionCodes.includes(
            requirement.code
          )
        );

      }),

      catchError(() => of(false))

    );

};