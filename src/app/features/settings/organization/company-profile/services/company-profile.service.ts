import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  CompanyProfile,
  UpdateCompanyProfileRequest
} from '../models/company-profile.model';

@Injectable({
  providedIn: 'root'
})
export class CompanyProfileService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  getProfile(
    companyId: number
  ): Observable<CompanyProfile> {

    return this.http.get<CompanyProfile>(
      `${this.apiUrl}/${companyId}/profile`
    );
  }

  updateProfile(
    companyId: number,
    request: UpdateCompanyProfileRequest
  ): Observable<CompanyProfile> {

    return this.http.put<CompanyProfile>(
      `${this.apiUrl}/${companyId}/profile`,
      request
    );
  }
}