import { inject } from '@angular/core';

import {
  CanActivateFn,
  Router
} from '@angular/router';

import {
  catchError,
  map,
  of
} from 'rxjs';

import { AuthService } from '../services/auth.service';


export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);


  // Access token is still valid.
  if (authService.isAuthenticated()) {
    return true;
  }


  // -------------------------------------------------------
  // Access token missing or expired.
  // Try to restore the session using the HttpOnly
  // refresh-token cookie.
  // -------------------------------------------------------
  return authService
    .refresh()
    .pipe(

      map(() => true),

      catchError(() => {

        return of(
          router.createUrlTree([
            '/login'
          ])
        );

      })

    );
};