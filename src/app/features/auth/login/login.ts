import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected isSubmitting = false;
  protected showPassword = false;
  protected errorMessage = '';

  protected readonly currentYear =
    new Date().getFullYear();

  protected readonly loginForm =
    this.formBuilder.nonNullable.group({
      email: [
        '',
        [
          Validators.required,
          Validators.email
        ]
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8)
        ]
      ]
    });

  protected get emailControl() {
    return this.loginForm.controls.email;
  }

  protected get passwordControl() {
    return this.loginForm.controls.password;
  }

  protected togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  protected submit(): void {
    this.errorMessage = '';

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    this.authService
      .login({
        email: this.emailControl.value.trim(),
        password: this.passwordControl.value
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
        })
      )
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/dashboard');
        },

        error: (error: HttpErrorResponse) => {
          this.errorMessage =
            this.getLoginErrorMessage(error);
        }
      });
  }

  private getLoginErrorMessage(
    error: HttpErrorResponse
  ): string {
    if (error.status === 0) {
      return 'Unable to connect to the iPOS server. Please check your connection and try again.';
    }

    if (error.status === 400) {
      return 'Please check the information you entered and try again.';
    }

    if (error.status === 401) {
      return 'The email address or password is incorrect.';
    }

    if (error.status === 403) {
      return 'Your account does not have permission to access this system.';
    }

    if (error.status >= 500) {
      return 'The server is temporarily unavailable. Please try again shortly.';
    }

    return 'Sign in could not be completed. Please try again.';
  }
}