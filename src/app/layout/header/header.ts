
import { Component, inject, signal } from '@angular/core';
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