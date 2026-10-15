
import {
  inject,
  Injectable
} from '@angular/core';

import {
  HttpClient
} from '@angular/common/http';

import {
  Observable
} from 'rxjs';

import {
  environment
} from '../../../../environments/environment';

import {
  WorkspaceOptionsResponse
} from '../models/workspace-options.model';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceOptionsService {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly http = inject(HttpClient);

  // =========================================================
  // API Configuration
  // =========================================================

  private readonly apiUrl =
    `${environment.apiBaseUrl}/workspace/options`;

  // =========================================================
  // Initial Workspace Options
  // =========================================================

  /**
   * Retrieves server-authorized workspace options.
   *
   * Used during AppShell initialization.
   */
  getOptions(): Observable<WorkspaceOptionsResponse> {

    return this.http.get<WorkspaceOptionsResponse>(
      this.apiUrl
    );
  }

  // =========================================================
  // Workspace Options Refresh
  // =========================================================

  /**
   * Starts an independent HTTP request for the latest
   * server-authorized workspace options.
   *
   * Every subscription represents a new request.
   *
   * The calling component is responsible for:
   *
   * - Cancelling obsolete requests.
   * - Validating the authentication session.
   * - Validating the currently selected company.
   * - Applying only the latest relevant response.
   *
   * No authorization data is cached in this service.
   */
  refreshOptions(): Observable<WorkspaceOptionsResponse> {

    return this.http.get<WorkspaceOptionsResponse>(
      this.apiUrl
    );
  }
}