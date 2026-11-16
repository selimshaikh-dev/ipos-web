
import {
  HttpClient
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
  OrganizationAccessMutationResponse,
  UserOrganizationAccess
} from '../models/company-branch-access.model';

@Injectable({
  providedIn: 'root'
})
export class CompanyBranchAccessService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  private organizationAccessUrl(
    companyId: number
  ): string {
    return `${this.apiUrl}/${companyId}/organization-access`;
  }

  private userAccessUrl(
    companyId: number,
    userId: string
  ): string {
    return `${this.organizationAccessUrl(companyId)}/users/${encodeURIComponent(userId)}`;
  }

  private branchUserAccessUrl(
    companyId: number,
    branchId: number,
    userId: string
  ): string {
    return `${this.organizationAccessUrl(companyId)}/branches/${branchId}/users/${encodeURIComponent(userId)}`;
  }

  // =======================================================
  // User Organization Access
  // =======================================================

  getUserOrganizationAccess(
    companyId: number,
    userId: string
  ): Observable<UserOrganizationAccess> {

    return this.http.get<UserOrganizationAccess>(
      this.userAccessUrl(companyId, userId)
    );
  }

  // =======================================================
  // Grant Company Access
  // =======================================================

  grantCompanyAccess(
    companyId: number,
    userId: string
  ): Observable<OrganizationAccessMutationResponse> {

    return this.http.post<OrganizationAccessMutationResponse>(
      `${this.userAccessUrl(companyId, userId)}/grant`,
      {}
    );
  }

  // =======================================================
  // Grant Branch Access
  // =======================================================

  grantBranchAccess(
    companyId: number,
    branchId: number,
    userId: string
  ): Observable<OrganizationAccessMutationResponse> {

    return this.http.post<OrganizationAccessMutationResponse>(
      this.branchUserAccessUrl(
        companyId,
        branchId,
        userId
      ),
      {}
    );
  }

  // =======================================================
  // Revoke Branch Access
  // =======================================================

  revokeBranchAccess(
    companyId: number,
    branchId: number,
    userId: string
  ): Observable<OrganizationAccessMutationResponse> {

    return this.http.delete<OrganizationAccessMutationResponse>(
      this.branchUserAccessUrl(
        companyId,
        branchId,
        userId
      )
    );
  }
}