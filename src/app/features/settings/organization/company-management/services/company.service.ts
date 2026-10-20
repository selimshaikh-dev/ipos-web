
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  Company,
  CompanyListQuery,
  CompanyPagedResult,
  CreateCompanyRequest,
  CreateCompanyResponse,
  UpdateCompanyProfileRequest,
  ChangeCompanyStatusRequest
} from '../models/company.model';

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiBaseUrl}/companies`;

  /**
   * Get paginated companies.
   *
   * GET /api/companies
   *
   * Requires SuperAdmin role.
   */
  getCompanies(
    query: CompanyListQuery = {}
  ): Observable<CompanyPagedResult> {
    let params = new HttpParams();

    if (query.includeInactive !== undefined) {
      params = params.set(
        'includeInactive',
        String(query.includeInactive)
      );
    }

    if (query.code !== undefined) {
      params = params.set('code', query.code);
    }

    if (query.name !== undefined) {
      params = params.set('name', query.name);
    }

    if (query.countryCode !== undefined) {
      params = params.set('countryCode', query.countryCode);
    }

    if (query.currencyCode !== undefined) {
      params = params.set('currencyCode', query.currencyCode);
    }

    if (query.isActive !== undefined) {
      params = params.set(
        'isActive',
        String(query.isActive)
      );
    }

    if (query.sortBy !== undefined) {
      params = params.set('sortBy', query.sortBy);
    }

    if (query.sortDirection !== undefined) {
      params = params.set(
        'sortDirection',
        query.sortDirection
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

    return this.http.get<CompanyPagedResult>(
      this.apiUrl,
      { params }
    );
  }

  /**
   * Create a new company.
   *
   * POST /api/companies
   *
   * Requires SuperAdmin role.
   */
  createCompany(
    request: CreateCompanyRequest
  ): Observable<CreateCompanyResponse> {
    return this.http.post<CreateCompanyResponse>(
      this.apiUrl,
      request
    );
  }

  /**
   * Get company profile.
   *
   * GET /api/companies/{companyId}/profile
   */
  getProfile(
    companyId: number
  ): Observable<Company> {
    return this.http.get<Company>(
      `${this.apiUrl}/${companyId}/profile`
    );
  }

  /**
   * Update company profile.
   *
   * PUT /api/companies/{companyId}/profile
   *
   * Requires SuperAdmin role.
   * Uses rowVersion for optimistic concurrency.
   */
  updateProfile(
    companyId: number,
    request: UpdateCompanyProfileRequest
  ): Observable<Company> {
    return this.http.put<Company>(
      `${this.apiUrl}/${companyId}/profile`,
      request
    );
  }

  /**
   * Activate or deactivate a company.
   *
   * PATCH /api/companies/{companyId}/status
   *
   * Requires SuperAdmin role.
   * Uses rowVersion for optimistic concurrency.
   */
  changeStatus(
    companyId: number,
    request: ChangeCompanyStatusRequest
  ): Observable<Company> {
    return this.http.patch<Company>(
      `${this.apiUrl}/${companyId}/status`,
      request
    );
  }
}