
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

export const authInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const router = inject(Router);

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
    requestPath === `${apiBaseUrl}/auth/login`;

  const isRefreshRequest =
    isApiRequest &&
    requestPath === `${apiBaseUrl}/auth/refresh`;

  const isLogoutRequest =
    isApiRequest &&
    requestPath === `${apiBaseUrl}/auth/logout`;

  const isNewInvitationRequest =
    isApiRequest &&
    requestPath === `${apiBaseUrl}/auth/invitations/accept`;

  const isExistingInvitationRequest =
    isApiRequest &&
    requestPath === `${apiBaseUrl}/auth/invitations/accept-existing`;

  const isAnonymousAuthRequest =
    isLoginRequest ||
    isRefreshRequest ||
    isLogoutRequest ||
    isNewInvitationRequest;

  const accessToken =
    tokenService.getAccessToken();

  const outgoingRequest =
    isApiRequest &&
    accessToken &&
    !isAnonymousAuthRequest
      ? request.clone({
          setHeaders: {
            Authorization: `Bearer ${accessToken}`
          }
        })
      : request;

  return next(outgoingRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      const shouldAttemptRefresh =
        error.status === 401 &&
        isApiRequest &&
        !isAnonymousAuthRequest;

      if (!shouldAttemptRefresh) {
        return throwError(() => error);
      }

      return authService.refresh().pipe(
        switchMap(() => {
          const newAccessToken =
            tokenService.getAccessToken();

          if (!newAccessToken) {
            authService.clearLocalSession();

            if (!isExistingInvitationRequest) {
              void router.navigateByUrl('/login');
            }

            return throwError(
              () => new Error(
                'Authentication refresh completed without an access token.'
              )
            );
          }

          const retryRequest = request.clone({
            setHeaders: {
              Authorization: `Bearer ${newAccessToken}`
            }
          });

          return next(retryRequest);
        }),

        catchError(refreshOrRetryError => {
          if (
            !authService.getCurrentUser() &&
            !isExistingInvitationRequest
          ) {
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