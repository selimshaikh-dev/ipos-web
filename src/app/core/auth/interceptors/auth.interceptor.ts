import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';

import { inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  Observable,
  catchError,
  finalize,
  shareReplay,
  switchMap,
  throwError
} from 'rxjs';

import { environment } from '../../../../environments/environment';

import { LoginResponse } from '../models/login-response.model';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';


let refreshRequest$: Observable<LoginResponse> | null =
  null;


export const authInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const router = inject(Router);


  const isApiRequest =
    request.url.startsWith(
      environment.apiBaseUrl
    );

  const isLoginRequest =
    request.url.endsWith(
      '/auth/login'
    );

  const isRefreshRequest =
    request.url.endsWith(
      '/auth/refresh'
    );


  const accessToken =
    tokenService.getAccessToken();


  let outgoingRequest = request;


  // -------------------------------------------------------
  // Attach JWT access token
  // -------------------------------------------------------
  if (
    isApiRequest &&
    accessToken &&
    !isLoginRequest &&
    !isRefreshRequest
  ) {
    outgoingRequest =
      request.clone({
        setHeaders: {
          Authorization:
            `Bearer ${accessToken}`
        }
      });
  }


  return next(outgoingRequest).pipe(

    catchError(
      (error: HttpErrorResponse) => {

        const shouldAttemptRefresh =
          error.status === 401 &&
          isApiRequest &&
          !isLoginRequest &&
          !isRefreshRequest;


        if (!shouldAttemptRefresh) {
          return throwError(
            () => error
          );
        }


        // -------------------------------------------------
        // Only ONE refresh request may run at a time.
        // Other failed requests wait for the same refresh.
        // -------------------------------------------------
        if (!refreshRequest$) {

          refreshRequest$ =
            authService
              .refresh()
              .pipe(

                finalize(() => {
                  refreshRequest$ = null;
                }),

                shareReplay({
                  bufferSize: 1,
                  refCount: false
                })

              );
        }


        return refreshRequest$.pipe(

          // -----------------------------------------------
          // Refresh succeeded.
          // Retry the original request with the new JWT.
          // -----------------------------------------------
          switchMap(() => {

            const newAccessToken =
              tokenService.getAccessToken();


            if (!newAccessToken) {

              tokenService.clear();

              void router.navigateByUrl(
                '/login'
              );

              return throwError(
                () => error
              );
            }


            const retryRequest =
              request.clone({
                setHeaders: {
                  Authorization:
                    `Bearer ${newAccessToken}`
                }
              });


            return next(
              retryRequest
            );
          }),


          // -----------------------------------------------
          // Refresh failed.
          // User must authenticate again.
          // -----------------------------------------------
          catchError(
            (refreshError: HttpErrorResponse) => {

              tokenService.clear();

              void router.navigateByUrl(
                '/login'
              );

              return throwError(
                () => refreshError
              );
            }
          )

        );
      }
    )

  );
};