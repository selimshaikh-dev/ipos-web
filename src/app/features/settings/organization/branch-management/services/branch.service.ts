
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  Branch,
  ChangeBranchStatusRequest,
  CreateBranchRequest,
  UpdateBranchRequest
} from '../models/branch.model';

@Injectable({
  providedIn: 'root'
})
export class BranchService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  getBranches(
    companyId: number
  ): Observable<Branch[]> {

    return this.http.get<Branch[]>(
      `${this.apiUrl}/${companyId}/branches`
    );
  }

  createBranch(
    companyId: number,
    request: CreateBranchRequest
  ): Observable<Branch> {

    return this.http.post<Branch>(
      `${this.apiUrl}/${companyId}/branches`,
      request
    );
  }

  updateBranch(
    companyId: number,
    branchId: number,
    request: UpdateBranchRequest
  ): Observable<Branch> {

    return this.http.put<Branch>(
      `${this.apiUrl}/${companyId}/branches/${branchId}`,
      request
    );
  }

  activateBranch(
    companyId: number,
    branchId: number,
    request: ChangeBranchStatusRequest
  ): Observable<Branch> {

    return this.http.put<Branch>(
      `${this.apiUrl}/${companyId}/branches/${branchId}/activate`,
      request
    );
  }

  deactivateBranch(
    companyId: number,
    branchId: number,
    request: ChangeBranchStatusRequest
  ): Observable<Branch> {

    return this.http.put<Branch>(
      `${this.apiUrl}/${companyId}/branches/${branchId}/deactivate`,
      request
    );
  }
}