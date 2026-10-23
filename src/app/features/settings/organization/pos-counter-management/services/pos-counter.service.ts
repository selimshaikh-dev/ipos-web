import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  CreatePosCounterRequest,
  GetPosCountersParams,
  PosCounter,
  PosCounterPagedResult,
  UpdatePosCounterRequest
} from '../models/pos-counter.model';

@Injectable({
  providedIn: 'root'
})
export class PosCounterService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/branches`;

  /**
   * ============================================================
   * 01. CREATE POS COUNTER
   * ============================================================
   *
   * POST /api/branches/{branchId}/pos-counters
   *
   * The backend generates the counter code automatically.
   *
   * Requires SuperAdmin authorization.
   */
  createPosCounter(
    branchId: number,
    request: CreatePosCounterRequest
  ): Observable<PosCounter> {

    return this.http.post<PosCounter>(
      `${this.apiUrl}/${branchId}/pos-counters`,
      request
    );
  }

  /**
   * ============================================================
   * 02. GET POS COUNTER DIRECTORY
   * ============================================================
   *
   * GET /api/branches/{branchId}/pos-counters
   *
   * Supports:
   * - Active/inactive filtering
   * - Counter code filtering
   * - Counter name filtering
   * - Device identifier filtering
   * - Default warehouse filtering
   * - Sorting
   * - Server-side pagination
   *
   * Authorization is enforced by the backend.
   */
  getPosCounters(
    branchId: number,
    filters: GetPosCountersParams = {}
  ): Observable<PosCounterPagedResult> {

    let params = new HttpParams();

    if (filters.includeInactive !== undefined) {
      params = params.set(
        'includeInactive',
        String(filters.includeInactive)
      );
    }

    if (filters.code?.trim()) {
      params = params.set(
        'code',
        filters.code.trim()
      );
    }

    if (filters.name?.trim()) {
      params = params.set(
        'name',
        filters.name.trim()
      );
    }

    if (filters.deviceIdentifier?.trim()) {
      params = params.set(
        'deviceIdentifier',
        filters.deviceIdentifier.trim()
      );
    }

    if (filters.defaultWarehouseId !== undefined) {
      params = params.set(
        'defaultWarehouseId',
        String(filters.defaultWarehouseId)
      );
    }

    if (filters.isActive !== undefined) {
      params = params.set(
        'isActive',
        String(filters.isActive)
      );
    }

    if (filters.sortBy?.trim()) {
      params = params.set(
        'sortBy',
        filters.sortBy.trim()
      );
    }

    if (filters.sortDirection !== undefined) {
      params = params.set(
        'sortDirection',
        filters.sortDirection
      );
    }

    if (filters.pageNumber !== undefined) {
      params = params.set(
        'pageNumber',
        String(filters.pageNumber)
      );
    }

    if (filters.pageSize !== undefined) {
      params = params.set(
        'pageSize',
        String(filters.pageSize)
      );
    }

    return this.http.get<PosCounterPagedResult>(
      `${this.apiUrl}/${branchId}/pos-counters`,
      { params }
    );
  }

  /**
   * ============================================================
   * 03. GET POS COUNTER BY ID
   * ============================================================
   *
   * GET /api/branches/{branchId}/pos-counters/{counterId}
   *
   * Returns:
   * - Counter information
   * - Device identifier
   * - Default warehouse assignment
   * - Activation status
   * - Current RowVersion
   *
   * The returned RowVersion should be used for updates.
   */
  getPosCounterById(
    branchId: number,
    counterId: number
  ): Observable<PosCounter> {

    return this.http.get<PosCounter>(
      `${this.apiUrl}/${branchId}/pos-counters/${counterId}`
    );
  }

  /**
   * ============================================================
   * 04. UPDATE POS COUNTER
   * ============================================================
   *
   * PUT /api/branches/{branchId}/pos-counters/{counterId}
   *
   * Requires SuperAdmin authorization.
   *
   * Supports:
   * - Counter name update
   * - Device identifier update/removal
   * - Default warehouse assignment/removal
   * - Optimistic concurrency using RowVersion
   *
   * Does not modify:
   * - Counter code
   * - Branch ownership
   * - Activation status
   *
   * Expected responses:
   *
   * 200 - Updated successfully
   * 400 - Validation failed
   * 401 - Authentication required
   * 403 - Permission denied
   * 404 - Counter or warehouse not found
   * 409 - Warehouse unavailable or concurrency conflict
   */
  updatePosCounter(
    branchId: number,
    counterId: number,
    request: UpdatePosCounterRequest
  ): Observable<PosCounter> {

    return this.http.put<PosCounter>(
      `${this.apiUrl}/${branchId}/pos-counters/${counterId}`,
      request
    );
  }
}