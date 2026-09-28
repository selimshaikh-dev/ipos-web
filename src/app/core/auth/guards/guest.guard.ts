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


export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);


  // Already authenticated.
  if (authService.isAuthenticated()) {
    return router.createUrlTree([
      '/dashboard'
    ]);
  }


  // -------------------------------------------------------
  // Access token missing or expired.
  // Check whether a valid refresh-token cookie still exists.
  // -------------------------------------------------------
  return authService
    .refresh()
    .pipe(

      map(() =>
        router.createUrlTree([
          '/dashboard'
        ])
      ),

      // No valid refresh session.
      // User may stay on the login page.
      catchError(() =>
        of(true)
      )

    );
};