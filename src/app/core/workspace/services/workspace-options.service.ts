
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

import { WorkspaceOptionsResponse } from '../models/workspace-options.model';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceOptionsService {

  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/workspace/options`;

  getOptions(): Observable<WorkspaceOptionsResponse> {
    return this.http.get<WorkspaceOptionsResponse>(
      this.apiUrl
    );
  }
}