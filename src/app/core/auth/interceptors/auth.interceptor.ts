
import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';

import { inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  catchError,
  switchMap,
  throwError
} from 'rxjs';

import { environment } from '../../../../environments/environment';

import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';

// =========================================================
// Authentication Interceptor
// =========================================================

export const authInterceptor: HttpInterceptorFn = (
  request,
  next
) => {

  // =======================================================
  // Dependencies
  // =======================================================

  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const router = inject(Router);

  // =======================================================
  // Request Classification
  // =======================================================

  const apiBaseUrl =
    environment.apiBaseUrl.replace(/\/+$/, '');

  const isApiRequest =
    request.url === apiBaseUrl ||
    request.url.startsWith(`${apiBaseUrl}/`) ||
    request.url.startsWith(`${apiBaseUrl}?`);

  const requestPath =
    request.url.split('?')[0].replace(/\/+$/, '');

  const isLoginRequest =
    isApiRequest &&
    requestPath.endsWith('/auth/login');

  const isRefreshRequest =
    isApiRequest &&
    requestPath.endsWith('/auth/refresh');

  const isLogoutRequest =
    isApiRequest &&
    requestPath.endsWith('/auth/logout');

  // =======================================================
  // Attach Access Token
  // =======================================================

  const accessToken =
    tokenService.getAccessToken();

  const outgoingRequest =
    isApiRequest &&
    accessToken &&
    !isLoginRequest &&
    !isRefreshRequest &&
    !isLogoutRequest
      ? request.clone({
          setHeaders: {
            Authorization: `Bearer ${accessToken}`
          }
        })
      : request;

  // =======================================================
  // Execute HTTP Request
  // =======================================================

  return next(outgoingRequest).pipe(

    catchError((error: HttpErrorResponse) => {

      // ===================================================
      // Refresh Eligibility
      // ===================================================

      const shouldAttemptRefresh =
        error.status === 401 &&
        isApiRequest &&
        !isLoginRequest &&
        !isRefreshRequest &&
        !isLogoutRequest;

      if (!shouldAttemptRefresh) {
        return throwError(() => error);
      }

      // ===================================================
      // Centralized Refresh
      // ===================================================
      //
      // AuthService coordinates concurrent refresh calls
      // from the interceptor and route guards.
      // ===================================================

      return authService.refresh().pipe(

        switchMap(() => {

          const newAccessToken =
            tokenService.getAccessToken();

          if (!newAccessToken) {

            // A refresh response without a usable token
            // cannot authorize the original request.

            authService.clearLocalSession();

            void router.navigateByUrl('/login');

            return throwError(
              () => new Error(
                'Authentication refresh completed without an access token.'
              )
            );
          }

          // =================================================
          // Retry Original Request
          // =================================================

          const retryRequest = request.clone({
            setHeaders: {
              Authorization: `Bearer ${newAccessToken}`
            }
          });

          return next(retryRequest).pipe(

            catchError((retryError: HttpErrorResponse) => {

              // A repeated 401 may indicate an invalid
              // session or endpoint-specific access rule.
              //
              // Do not automatically clear authentication
              // solely because a retried request returns 401.

              return throwError(() => retryError);
            })

          );
        }),

        catchError(refreshOrRetryError => {

          // AuthService owns refresh failure cleanup.
          //
          // For example, HTTP 400/401 from the refresh
          // endpoint invalidates the local session.
          //
          // Network errors and unrelated retry failures
          // must not automatically destroy the session.

          if (!authService.getCurrentUser()) {
            void router.navigateByUrl('/login');
          }

          return throwError(
            () => refreshOrRetryError
          );
        })

      );
    })

  );
};