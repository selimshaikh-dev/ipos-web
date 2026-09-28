import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

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

  protected readonly currentUser =
    this.authService.getCurrentUser();

  protected isUserMenuOpen = false;


  protected toggleUserMenu(): void {
    this.isUserMenuOpen =
      !this.isUserMenuOpen;
  }


  protected logout(): void {
    this.isUserMenuOpen = false;

    this.authService
      .logout()
      .subscribe({

        next: () => {
          void this.router.navigateByUrl(
            '/login'
          );
        },

        error: () => {
          // Even if the API is unavailable,
          // remove the local authentication state.
          this.authService.clearLocalSession();

          void this.router.navigateByUrl(
            '/login'
          );
        }

      });
  }


  protected get userInitials(): string {
    const name =
      this.currentUser?.fullName?.trim();

    if (!name) {
      return 'U';
    }

    const parts =
      name
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 1) {
      return parts[0]
        .substring(0, 2)
        .toUpperCase();
    }

    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }


  protected get primaryRole(): string {
    return this.currentUser?.roles?.[0]
      ?? 'User';
  }
}