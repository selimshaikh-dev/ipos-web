import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** UI route guard; API authorization must also enforce SuperAdmin. */
export const platformGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = auth.getCurrentUser()?.roles?.some(
    role => role.toLowerCase() === 'superadmin'
  ) ?? false;
  return allowed ? true : router.createUrlTree(['/dashboard']);
};