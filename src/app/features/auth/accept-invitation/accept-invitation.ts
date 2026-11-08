import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';

import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';

import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';

import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import {
  catchError,
  finalize,
  map,
  of,
  timeout
} from 'rxjs';

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/services/auth.service';

interface AcceptInvitationResponse {
  message: string;
  userId: string;
  companyId: number;
}

type InvitationSessionState =
  | 'checking'
  | 'authenticated'
  | 'unauthenticated'
  | 'unavailable';

function passwordsMatch(
  control: AbstractControl
): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmPassword')?.value;

  return password === confirmation
    ? null
    : { passwordMismatch: true };
}

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './accept-invitation.html',
  styleUrl: './accept-invitation.scss'
})
export class AcceptInvitation implements OnInit {

  // =========================================================
  // DEPENDENCIES
  // =========================================================

  private readonly http = inject(HttpClient);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly apiUrl =
    `${environment.apiBaseUrl}/auth/invitations`;

  private readonly sessionTimeoutMs = 10000;

  // =========================================================
  // PAGE STATE
  // =========================================================

  protected readonly currentYear =
    new Date().getFullYear();

  protected token = '';

  protected isAuthenticated = false;
  protected isResolvingSession = true;
  protected isSubmitting = false;
  protected isCompleted = false;

  protected showPassword = false;
  protected showConfirmPassword = false;

  protected errorMessage = '';

  private sessionState: InvitationSessionState =
    'checking';

  // =========================================================
  // REACTIVE FORM
  // =========================================================

  protected readonly invitationForm =
    this.formBuilder.nonNullable.group(
      {
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8)
          ]
        ],
        confirmPassword: [
          '',
          [
            Validators.required
          ]
        ]
      },
      {
        validators: passwordsMatch
      }
    );

  protected get passwordControl() {
    return this.invitationForm.controls.password;
  }

  protected get confirmPasswordControl() {
    return this.invitationForm.controls.confirmPassword;
  }

  // =========================================================
  // INITIALIZATION
  // =========================================================

  ngOnInit(): void {

    const invitationToken =
      this.route.snapshot.queryParamMap
        .get('token')
        ?.trim() ?? '';

    if (
      !invitationToken ||
      invitationToken.length > 512
    ) {
      this.token = '';

      this.errorMessage =
        'This invitation link is invalid. Please request a new invitation.';

      this.isResolvingSession = false;
      return;
    }

    this.token = invitationToken;

    // Remove the invitation token from the visible URL.
    // Keep it only in component memory.
    //
    // replaceUrl avoids adding another browser history entry.

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        token: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });

    this.resolveAuthenticationSession();
  }

  // =========================================================
  // SESSION RESTORATION
  // =========================================================

  private resolveAuthenticationSession(): void {

    this.isResolvingSession = true;
    this.sessionState = 'checking';
    this.errorMessage = '';

    // Valid local authentication session.
    if (this.authService.isAuthenticated()) {

      this.isAuthenticated = true;
      this.sessionState = 'authenticated';
      this.isResolvingSession = false;

      return;
    }

    // Attempt session restoration through the existing
    // HttpOnly refresh-token cookie.
    //
    // Timeout prevents indefinite loading.

    this.authService
      .refresh()
      .pipe(
        timeout({
          first: this.sessionTimeoutMs
        }),

        map(() => ({
          authenticated: true,
          unavailable: false
        })),

        catchError((error: unknown) => {

          // A 400/401 response means that no valid
          // refresh session is available.
          //
          // Network failures and timeouts are different:
          // they do not prove that the user is new.

          if (
            error instanceof HttpErrorResponse &&
            (
              error.status === 400 ||
              error.status === 401
            )
          ) {
            return of({
              authenticated: false,
              unavailable: false
            });
          }

          return of({
            authenticated: false,
            unavailable: true
          });
        }),

        finalize(() => {
          this.isResolvingSession = false;
          this.changeDetector.markForCheck();
        }),

        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => {

        this.isAuthenticated =
          result.authenticated;

        if (result.authenticated) {

          this.sessionState = 'authenticated';
          this.changeDetector.markForCheck();
          return;
        }

        if (result.unavailable) {

          this.sessionState = 'unavailable';

          this.errorMessage =
            'Unable to verify your authentication session. Please check the server connection and reopen the invitation link from your email.';

          this.changeDetector.markForCheck();
          return;
        }

        this.sessionState = 'unauthenticated';
        this.changeDetector.markForCheck();
      });
  }

  // =========================================================
  // PASSWORD VISIBILITY
  // =========================================================

  protected togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword =
      !this.showConfirmPassword;
  }

  // =========================================================
  // INVITATION ACCEPTANCE
  // =========================================================

  protected submit(): void {

    if (
      this.isResolvingSession ||
      this.isSubmitting ||
      this.isCompleted ||
      !this.token ||
      this.token.length > 512 ||
      this.sessionState === 'unavailable' ||
      this.sessionState === 'checking'
    ) {
      return;
    }

    this.errorMessage = '';

    // New users must provide a valid password.
    if (
      !this.isAuthenticated &&
      this.invitationForm.invalid
    ) {

      this.invitationForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const request$ = this.isAuthenticated

      // Existing user:
      // Identity is resolved by the backend
      // from the authenticated request.
      ? this.http.post<AcceptInvitationResponse>(
          `${this.apiUrl}/accept-existing`,
          {
            token: this.token
          }
        )

      // New user:
      // Create password and accept invitation.
      : this.http.post<AcceptInvitationResponse>(
          `${this.apiUrl}/accept`,
          {
            token: this.token,
            password: this.passwordControl.value
          }
        );

    request$
      .pipe(
        timeout({
          first: 30000
        }),

        finalize(() => {
          this.isSubmitting = false;
          this.changeDetector.markForCheck();
        }),

        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

        next: () => {

          this.isCompleted = true;
          this.errorMessage = '';

          // Remove sensitive data from component state.
          this.token = '';
          this.invitationForm.reset();
          this.changeDetector.markForCheck();

        },

        error: (error: unknown) => {

          this.errorMessage =
            this.getErrorMessage(error);
          this.changeDetector.markForCheck();

        }

      });
  }

  // =========================================================
  // API ERROR HANDLING
  // =========================================================

  private getErrorMessage(
    error: unknown
  ): string {

    if (!(error instanceof HttpErrorResponse)) {

      return 'The request could not be completed. Please try again.';
    }

    if (error.status === 0) {

      return 'Unable to connect to the iPOS server. Please check your connection and try again.';
    }

    if (error.status === 401) {

      return 'Authentication is required or this invitation does not belong to your account.';
    }

    if (error.status === 403) {

      return 'You do not have permission to accept this invitation.';
    }

    if (
      error.status === 400 ||
      error.status === 409
    ) {

      const message: unknown =
        error.error?.message;

      if (
        typeof message === 'string' &&
        message.trim()
      ) {
        return message;
      }

      return 'The invitation could not be accepted. Please verify the invitation link.';
    }

    if (error.status >= 500) {

      return 'The server is temporarily unavailable. Please try again later.';
    }

    return 'Invitation acceptance could not be completed.';
  }
}