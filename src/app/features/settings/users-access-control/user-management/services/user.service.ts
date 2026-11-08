
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
  CreateUserRequest,
  UpdateUserRequest,
  UserDetails,
  UserListQuery,
  UserMutationResponse,
  UserPagedResult,
  UserStatusResponse
} from '../models/user.model';

export interface UserInvitationStatus {
  userId: string;
  companyId: number;
  status: 'None' | 'Pending' | 'Expired' | 'Revoked' | 'Accepted';
  createdAtUtc: string | null;
  expiresAtUtc: string | null;
  acceptedAtUtc: string | null;
  revokedAtUtc: string | null;
}

export interface UserInvitationActionResponse {
  id: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  private usersUrl(companyId: number): string {
    return `${this.apiUrl}/${companyId}/users`;
  }

  private userUrl(
    companyId: number,
    userId: string
  ): string {
    return `${this.usersUrl(companyId)}/${encodeURIComponent(userId)}`;
  }

  // =======================================================
  // Users Directory
  // =======================================================

  getUsers(
    companyId: number,
    query: UserListQuery = {}
  ): Observable<UserPagedResult> {

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

    return this.http.get<UserPagedResult>(
      this.usersUrl(companyId),
      { params }
    );
  }

  // =======================================================
  // User Details
  // =======================================================

  getUserDetails(
    companyId: number,
    userId: string
  ): Observable<UserDetails> {

    return this.http.get<UserDetails>(
      this.userUrl(companyId, userId)
    );
  }

  // =======================================================
  // Create User
  // =======================================================

  createUser(
    companyId: number,
    request: CreateUserRequest
  ): Observable<UserMutationResponse> {

    return this.http.post<UserMutationResponse>(
      this.usersUrl(companyId),
      request
    );
  }

  // =======================================================
  // Update User
  // =======================================================

  updateUser(
    companyId: number,
    userId: string,
    request: UpdateUserRequest
  ): Observable<UserMutationResponse> {

    return this.http.put<UserMutationResponse>(
      this.userUrl(companyId, userId),
      request
    );
  }

  // =======================================================
  // Activate Company Access
  // =======================================================

  activateUser(
    companyId: number,
    userId: string
  ): Observable<UserStatusResponse> {

    return this.http.patch<UserStatusResponse>(
      `${this.userUrl(companyId, userId)}/activate`,
      {}
    );
  }

  // =======================================================
  // Deactivate Company Access
  // =======================================================

  deactivateUser(
    companyId: number,
    userId: string
  ): Observable<UserStatusResponse> {

    return this.http.patch<UserStatusResponse>(
      `${this.userUrl(companyId, userId)}/deactivate`,
      {}
    );
  }

  // =======================================================
  // Get Invitation Status
  // =======================================================

  getInvitationStatus(
    companyId: number,
    userId: string
  ): Observable<UserInvitationStatus> {

    return this.http.get<UserInvitationStatus>(
      `${this.userUrl(companyId, userId)}/invitation`
    );
  }

  // =======================================================
  // Reissue / Resend Invitation
  // =======================================================

  reissueInvitation(
    companyId: number,
    userId: string
  ): Observable<UserInvitationActionResponse> {

    return this.http.post<UserInvitationActionResponse>(
      `${this.userUrl(companyId, userId)}/invitation/reissue`,
      {}
    );
  }

  // =======================================================
  // Revoke Invitation
  // =======================================================

  revokeInvitation(
    companyId: number,
    userId: string
  ): Observable<UserInvitationActionResponse> {

    return this.http.post<UserInvitationActionResponse>(
      `${this.userUrl(companyId, userId)}/invitation/revoke`,
      {}
    );
  }
}