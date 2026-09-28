import { Component, inject } from '@angular/core';

import {
  Router,
  RouterOutlet
} from '@angular/router';

import { Sidebar } from '../sidebar/sidebar';
import { Header } from '../header/header';
import { Footer } from '../footer/footer';

import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-shell',

  standalone: true,

  imports: [
    RouterOutlet,
    Sidebar,
    Header,
    Footer
  ],

  templateUrl: './app-shell.html',

  styleUrl: './app-shell.scss'
})
export class AppShell {

  private readonly authService =
    inject(AuthService);

  private readonly router =
    inject(Router);


  protected logout(): void {

    this.authService.logout();

    void this.router.navigateByUrl('/login');
  }
}