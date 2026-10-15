
import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';

import {
  Injectable,
  inject,
  signal
} from '@angular/core';

import {
  Observable,
  catchError,
  defer,
  finalize,
  shareReplay,
  tap,
  throwError
} from 'rxjs';

import { environment } from '../../../../environments/environment';

import { WorkspaceContextService } from '../../workspace/services/workspace-context.service';

import { AuthUser } from '../models/auth-user.model';
import { LoginRequest } from '../models/login-request.model';
import { LoginResponse } from '../models/login-response.model';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly http = inject(HttpClient);

  private readonly tokenService =
    inject(TokenService);

  private readonly workspaceContext =
    inject(WorkspaceContextService);

  private readonly authApiUrl =
    `${environment.apiBaseUrl}/auth`;

  // =========================================================
  // Authentication Lifecycle State
  // =========================================================

  /**
   * Shared refresh request.
   *
   * Concurrent callers reuse the same HTTP operation.
   */
  private refreshRequest$: Observable<LoginResponse> | null =
    null;

  /**
   * Reactive authentication lifecycle version.
   *
   * Incremented when:
   *
   * - A new login attempt starts.
   * - The local authentication session is cleared.
   *
   * Normal access-token refresh does not increment
   * this generation.
   */
  private readonly sessionGenerationState = signal(0);

  /**
   * Read-only session generation signal.
   *
   * Angular components can observe this signal
   * inside computed() or effect().
   */
  readonly sessionGenerationSignal =
    this.sessionGenerationState.asReadonly();

  // =========================================================
  // Session Generation Accessor
  // =========================================================

  /**
   * Preserves the existing public API.
   *
   * Other services and components can continue
   * calling getSessionGeneration().
   *
   * Reading this method inside an Angular reactive
   * context also registers the signal dependency.
   *
   * This is a client-side consistency mechanism,
   * not an authorization token.
   */
  getSessionGeneration(): number {
    return this.sessionGenerationState();
  }

  /**
   * Advances the authentication lifecycle version.
   *
   * All requests that captured an earlier generation
   * become obsolete.
   */
  private advanceSessionGeneration(): number {

    const nextGeneration =
      this.sessionGenerationState() + 1;

    this.sessionGenerationState.set(nextGeneration);

    return nextGeneration;
  }

  // =========================================================
  // Login
  // =========================================================

  login(
    request: LoginRequest
  ): Observable<LoginResponse> {

    return defer(() => {

      // Invalidate pending refresh responses before
      // beginning a new login attempt.

      const generation =
        this.advanceSessionGeneration();

      this.refreshRequest$ = null;

      return this.http
        .post<LoginResponse>(
          `${this.authApiUrl}/login`,
          request,
          {
            withCredentials: true
          }
        )
        .pipe(
          tap(response => {

            this.assertCurrentGeneration(
              generation
            );

            const previousUserId =
              this.tokenService.getUser()?.userId;

            if (
              previousUserId &&
              previousUserId !== response.userId
            ) {
              this.workspaceContext
                .clearPersistedSelection();
            }

            // Authorized workspace options will be
            // loaded again after authentication.

            this.workspaceContext.clear();

            this.storeAuthentication(response);
          })
        );
    });
  }

  // =========================================================
  // Centralized Refresh Token Coordination
  // =========================================================

  refresh(): Observable<LoginResponse> {

    return defer(() => {

      if (this.refreshRequest$) {
        return this.refreshRequest$;
      }

      const generation =
        this.getSessionGeneration();

      let sharedRequest$!: Observable<LoginResponse>;

      sharedRequest$ = this.http
        .post<LoginResponse>(
          `${this.authApiUrl}/refresh`,
          {},
          {
            withCredentials: true
          }
        )
        .pipe(

          tap(response => {

            // Ignore responses from invalidated
            // authentication lifecycles.

            this.assertCurrentGeneration(
              generation
            );

            const previousUserId =
              this.tokenService.getUser()?.userId;

            if (
              previousUserId &&
              previousUserId !== response.userId
            ) {
              this.workspaceContext
                .clearPersistedSelection();

              this.workspaceContext.clear();
            }

            this.storeAuthentication(response);
          }),

          catchError(error => {

            // An older request must not clear
            // a newer authentication session.

            if (
              generation !==
              this.getSessionGeneration()
            ) {
              return throwError(() => error);
            }

            // Backend rejected the refresh request.
            // Temporary network errors do not
            // automatically invalidate the session.

            if (
              error instanceof HttpErrorResponse &&
              (
                error.status === 400 ||
                error.status === 401
              )
            ) {
              this.clearLocalSession();
            }

            return throwError(() => error);
          }),

          finalize(() => {

            if (
              this.refreshRequest$ ===
              sharedRequest$
            ) {
              this.refreshRequest$ = null;
            }
          }),

          shareReplay({
            bufferSize: 1,
            refCount: false
          })
        );

      this.refreshRequest$ = sharedRequest$;

      return sharedRequest$;
    });
  }

  // =========================================================
  // Logout
  // =========================================================

  logout(): Observable<void> {

    return defer(() => {

      // Preserve the current access token for the
      // outgoing logout request.

      const accessToken =
        this.tokenService.getAccessToken();

      // Immediately invalidate local authentication
      // state and pending refresh responses.

      this.clearLocalSession();

      return this.http
        .post<void>(
          `${this.authApiUrl}/logout`,
          {},
          {
            withCredentials: true,
            headers: accessToken
              ? {
                  Authorization:
                    `Bearer ${accessToken}`
                }
              : {}
          }
        );
    });
  }

  // =========================================================
  // Local Session Cleanup
  // =========================================================

  clearLocalSession(): void {

    // Invalidate pending authentication responses.
    this.advanceSessionGeneration();

    this.refreshRequest$ = null;

    // Remove persisted branch selections while
    // the authenticated user identity exists.

    this.workspaceContext
      .clearPersistedSelection();

    // Reset in-memory company, branch and
    // authorized branch options.

    this.workspaceContext.clear();

    // Clear local authentication credentials.
    this.tokenService.clear();
  }

  // =========================================================
  // Authentication State
  // =========================================================

  isAuthenticated(): boolean {
    return this.tokenService.isAuthenticated();
  }

  getCurrentUser(): AuthUser | null {
    return this.tokenService.getUser();
  }

  getAccessToken(): string | null {
    return this.tokenService.getAccessToken();
  }

  // =========================================================
  // Authentication Storage
  // =========================================================

  private storeAuthentication(
    response: LoginResponse
  ): void {

    this.tokenService.setAccessToken(
      response.accessToken,
      response.expiresAtUtc
    );

    const user: AuthUser = {
      userId: response.userId,
      fullName: response.fullName,
      email: response.email,
      roles: response.roles
    };

    this.tokenService.setUser(user);
  }

  // =========================================================
  // Session Generation Validation
  // =========================================================

  /**
   * Prevents outdated login or refresh responses
   * from modifying the current authentication state.
   */
  private assertCurrentGeneration(
    generation: number
  ): void {

    if (
      generation !==
      this.getSessionGeneration()
    ) {
      throw new Error(
        'Authentication session changed while the request was in progress.'
      );
    }
  }
}