
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
  RoleListQuery,
  RolePagedResult
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

  // =======================================================
  // Roles Directory
  // =======================================================

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
}