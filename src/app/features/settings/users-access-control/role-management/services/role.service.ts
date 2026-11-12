
import {
  HttpClient,
  HttpParams
} from '@angular/common/http';

import {
  inject,
  Injectable
} from '@angular/core';

import {
  Observable
} from 'rxjs';

import {
  environment
} from '../../../../../../environments/environment';

import {
  ChangeRoleStatusRequest,
  CreateRoleRequest,
  CreatedRole,
  RoleListQuery,
  RolePagedResult,
  RoleStatus,
  UpdatedRole,
  UpdateRoleRequest
} from '../models/role.model';

@Injectable({
  providedIn: 'root'
})
export class RoleService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  private rolesUrl(companyId: number): string {
    return `${this.apiUrl}/${companyId}/roles`;
  }

  private roleUrl(
    companyId: number,
    roleId: number
  ): string {
    return `${this.rolesUrl(companyId)}/${roleId}`;
  }

  // =========================================================
  // Roles Directory
  // =========================================================

  getRoles(
    companyId: number,
    query: RoleListQuery = {}
  ): Observable<RolePagedResult> {

    let params = new HttpParams();

    if (query.search?.trim()) {
      params = params.set(
        'search',
        query.search.trim()
      );
    }

    if (query.isActive !== undefined) {
      params = params.set(
        'isActive',
        String(query.isActive)
      );
    }

    if (query.roleType) {
      params = params.set(
        'roleType',
        query.roleType
      );
    }

    if (query.pageNumber !== undefined) {
      params = params.set(
        'pageNumber',
        String(query.pageNumber)
      );
    }

    if (query.pageSize !== undefined) {
      params = params.set(
        'pageSize',
        String(query.pageSize)
      );
    }

    return this.http.get<RolePagedResult>(
      this.rolesUrl(companyId),
      { params }
    );
  }

  // =========================================================
  // Create Custom Role
  // =========================================================

  createRole(
    companyId: number,
    request: CreateRoleRequest
  ): Observable<CreatedRole> {

    return this.http.post<CreatedRole>(
      this.rolesUrl(companyId),
      request
    );
  }

  // =========================================================
  // Update Custom Role
  // =========================================================

  updateRole(
    companyId: number,
    roleId: number,
    request: UpdateRoleRequest
  ): Observable<UpdatedRole> {

    return this.http.put<UpdatedRole>(
      this.roleUrl(companyId, roleId),
      request
    );
  }

  // =========================================================
  // Activate Custom Role
  // =========================================================

  activateRole(
    companyId: number,
    roleId: number,
    request: ChangeRoleStatusRequest
  ): Observable<RoleStatus> {

    return this.http.patch<RoleStatus>(
      `${this.roleUrl(companyId, roleId)}/activate`,
      request
    );
  }

  // =========================================================
  // Deactivate Custom Role
  // =========================================================

  deactivateRole(
    companyId: number,
    roleId: number,
    request: ChangeRoleStatusRequest
  ): Observable<RoleStatus> {

    return this.http.patch<RoleStatus>(
      `${this.roleUrl(companyId, roleId)}/deactivate`,
      request
    );
  }
}