import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class Header {

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Route state is updated on every successful navigation (including browser back/forward).
  private readonly currentUrl = signal(this.router.url);

  protected readonly pageContext = () => {
    const path = this.currentUrl().split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';

    switch (path) {
      case '/platform':
        return { title: 'Platform Dashboard', subtitle: 'System Administration' };
      case '/settings/organization/company-management':
        return { title: 'Company Management', subtitle: 'Platform / Organization' };
      case '/settings/organization/branch-management':
        return { title: 'Branch Management', subtitle: 'Settings / Organization' };
      case '/dashboard':
        return { title: 'Dashboard', subtitle: 'Business Overview' };
      default:
        return { title: 'iPOS', subtitle: 'Business Management' };
    }
  };

  // The POS Terminal route is not yet implemented in the current app routes.
  // Do not display a New Sale action that cannot perform a sale.
  protected readonly showNewSale = () => false;

  constructor() {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed()
    ).subscribe(event => this.currentUrl.set(event.urlAfterRedirects));
  }

  protected readonly currentUser =
    this.authService.getCurrentUser();

  protected readonly isUserMenuOpen = signal(false);

  protected toggleUserMenu(): void {
    this.isUserMenuOpen.update(isOpen => !isOpen);
  }

  protected closeUserMenu(): void {
    this.isUserMenuOpen.set(false);
  }

  protected logout(): void {
    this.closeUserMenu();

    this.authService
      .logout()
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/login');
        },

        error: () => {
          this.authService.clearLocalSession();
          void this.router.navigateByUrl('/login');
        }
      });
  }

  protected get userInitials(): string {
    const name = this.currentUser?.fullName?.trim();

    if (!name) {
      return 'U';
    }

    const parts = name
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }

    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }

  protected get primaryRole(): string {
    return this.currentUser?.roles?.[0] ?? 'User';
  }
}