import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  ChangeUnitOfMeasureStatusRequest,
  CreateUnitOfMeasureRequest,
  UnitOfMeasure,
  UnitOfMeasureListQuery,
  UnitOfMeasurePagedResult,
  UpdateUnitOfMeasureRequest
} from '../models/unit-of-measurement.model';

@Injectable({
  providedIn: 'root'
})
export class UnitOfMeasureService {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly http = inject(HttpClient);

  // =========================================================
  // API Configuration
  // =========================================================

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  // =========================================================
  // Get Units of Measurement
  //
  // GET /api/companies/{companyId}/units-of-measurement
  //
  // Features:
  // - Company-scoped directory
  // - Code, name and symbol filtering
  // - Active / inactive filtering
  // - Server-side sorting
  // - Server-side pagination
  //
  // Required permission:
  // - uom.view
  //
  // Authorization is enforced by the backend.
  // =========================================================

  getUnitsOfMeasurement(
    companyId: number,
    query: UnitOfMeasureListQuery = {}
  ): Observable<UnitOfMeasurePagedResult> {

    let params = new HttpParams();

    if (query.code !== undefined && query.code.trim() !== '') {
      params = params.set('code', query.code.trim());
    }

    if (query.name !== undefined && query.name.trim() !== '') {
      params = params.set('name', query.name.trim());
    }

    if (query.symbol !== undefined && query.symbol.trim() !== '') {
      params = params.set('symbol', query.symbol.trim());
    }

    if (query.isActive !== undefined) {
      params = params.set(
        'isActive',
        String(query.isActive)
      );
    }

    if (query.includeInactive !== undefined) {
      params = params.set(
        'includeInactive',
        String(query.includeInactive)
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

    return this.http.get<UnitOfMeasurePagedResult>(
      `${this.apiUrl}/${companyId}/units-of-measurement`,
      { params }
    );
  }

  // =========================================================
  // Get Unit of Measurement By ID
  //
  // GET /api/companies/{companyId}/units-of-measurement/{id}
  //
  // Features:
  // - Company-scoped lookup
  // - Retrieve current RowVersion
  //
  // Required permission:
  // - uom.view
  //
  // Authorization is enforced by the backend.
  // =========================================================

  getUnitOfMeasureById(
    companyId: number,
    unitOfMeasureId: number
  ): Observable<UnitOfMeasure> {

    return this.http.get<UnitOfMeasure>(
      `${this.apiUrl}/${companyId}/units-of-measurement/${unitOfMeasureId}`
    );
  }

  // =========================================================
  // Create Unit of Measurement
  //
  // POST /api/companies/{companyId}/units-of-measurement
  //
  // Required permission:
  // - uom.create
  //
  // Business Rules:
  // - Code, name and symbol are required.
  // - Code is unique within the company.
  // - Code cannot be changed after creation.
  //
  // Authorization is enforced by the backend.
  // =========================================================

  createUnitOfMeasure(
    companyId: number,
    request: CreateUnitOfMeasureRequest
  ): Observable<UnitOfMeasure> {

    return this.http.post<UnitOfMeasure>(
      `${this.apiUrl}/${companyId}/units-of-measurement`,
      request
    );
  }

  // =========================================================
  // Update Unit of Measurement
  //
  // PUT /api/companies/{companyId}/units-of-measurement/{id}
  //
  // Required permission:
  // - uom.update
  //
  // Editable properties:
  // - Name
  // - Symbol
  //
  // Protected properties:
  // - Code
  // - CompanyId
  // - IsActive
  //
  // Uses RowVersion for optimistic concurrency.
  //
  // Authorization is enforced by the backend.
  // =========================================================

  updateUnitOfMeasure(
    companyId: number,
    unitOfMeasureId: number,
    request: UpdateUnitOfMeasureRequest
  ): Observable<UnitOfMeasure> {

    return this.http.put<UnitOfMeasure>(
      `${this.apiUrl}/${companyId}/units-of-measurement/${unitOfMeasureId}`,
      request
    );
  }

  // =========================================================
  // Activate Unit of Measurement
  //
  // PUT /api/companies/{companyId}/units-of-measurement/{id}/activate
  //
  // Required permission:
  // - uom.activate
  //
  // Uses RowVersion for optimistic concurrency.
  //
  // Authorization is enforced by the backend.
  // =========================================================

  activateUnitOfMeasure(
    companyId: number,
    unitOfMeasureId: number,
    request: ChangeUnitOfMeasureStatusRequest
  ): Observable<UnitOfMeasure> {

    return this.http.put<UnitOfMeasure>(
      `${this.apiUrl}/${companyId}/units-of-measurement/${unitOfMeasureId}/activate`,
      request
    );
  }

  // =========================================================
  // Deactivate Unit of Measurement
  //
  // PUT /api/companies/{companyId}/units-of-measurement/{id}/deactivate
  //
  // Required permission:
  // - uom.deactivate
  //
  // Uses RowVersion for optimistic concurrency.
  //
  // Authorization is enforced by the backend.
  // =========================================================

  deactivateUnitOfMeasure(
    companyId: number,
    unitOfMeasureId: number,
    request: ChangeUnitOfMeasureStatusRequest
  ): Observable<UnitOfMeasure> {

    return this.http.put<UnitOfMeasure>(
      `${this.apiUrl}/${companyId}/units-of-measurement/${unitOfMeasureId}/deactivate`,
      request
    );
  }
}