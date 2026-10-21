
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  CreatePosCounterRequest,
  PosCounter
} from '../models/pos-counter.model';

@Injectable({
  providedIn: 'root'
})
export class PosCounterService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/branches`;

  /**
   * Creates a new POS Counter under the specified Branch.
   *
   * The backend automatically generates the Counter Code.
   * Example: POS001, POS002, POS003.
   *
   * Requires SuperAdmin authorization.
   *
   * POST /api/branches/{branchId}/pos-counters
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
}