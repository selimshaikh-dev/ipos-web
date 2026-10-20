import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';

import {
  Company,
  UpdateCompanyProfileRequest
} from '../../models/company.model';

import { CompanyService } from '../../services/company.service';

import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';

@Component({
  selector: 'app-company-management',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './company-management.html',
  styleUrl: './company-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompanyManagement {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);

  private readonly companyService =
    inject(CompanyService);

  private readonly notificationService =
    inject(NotificationService);

  private readonly workspaceContext =
    inject(WorkspaceContextService);

  private readonly destroyRef =
    inject(DestroyRef);

  // =========================================================
  // Active Workspace (client-side context, not authorization)
  // =========================================================

  private readonly companyId = this.workspaceContext.companyId;
  private loadedCompanyId: number | null = null;
  private profileLoadSubscription?: Subscription;

  // =========================================================
  // Page State
  // =========================================================

  readonly isLoading = signal(false);

  readonly isSaving = signal(false);

  readonly loadError =
    signal<string | null>(null);

  readonly companyCode =
    signal<string>('');

  readonly isActive =
    signal<boolean>(false);

  // =========================================================
  // Optimistic Concurrency
  // =========================================================

  private rowVersion = '';

  // =========================================================
  // Reactive Form
  // =========================================================

  readonly form = this.formBuilder.nonNullable.group({

    name: [
      '',
      [
        Validators.required,
        Validators.maxLength(200)
      ]
    ],

    legalName: [
      '',
      Validators.maxLength(250)
    ],

    registrationNumber: [
      '',
      Validators.maxLength(100)
    ],

    taxRegistrationNumber: [
      '',
      Validators.maxLength(100)
    ],

    phone: [
      '',
      Validators.maxLength(50)
    ],

    email: [
      '',
      [
        Validators.email,
        Validators.maxLength(254)
      ]
    ],

    website: [
      '',
      Validators.maxLength(500)
    ],

    addressLine1: [
      '',
      Validators.maxLength(250)
    ],

    addressLine2: [
      '',
      Validators.maxLength(250)
    ],

    city: [
      '',
      Validators.maxLength(100)
    ],

    stateOrProvince: [
      '',
      Validators.maxLength(100)
    ],

    postalCode: [
      '',
      Validators.maxLength(20)
    ],

    countryCode: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(2)
      ]
    ],

    currencyCode: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(3)
      ]
    ],

    timeZoneId: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],

    logoUrl: [
      '',
      Validators.maxLength(1000)
    ]

  });

  // =========================================================
  // Initialization
  // =========================================================

  constructor() {
    effect(() => {
      const companyId = this.companyId();

      // Cancel any request for a previously selected company.
      this.profileLoadSubscription?.unsubscribe();
      this.loadedCompanyId = null;
      this.rowVersion = '';
      this.companyCode.set('');
      this.isActive.set(false);
      this.form.reset();

      if (companyId === null) {
        this.isLoading.set(false);
        this.loadError.set('Select a company to view its profile.');
        return;
      }

      this.loadProfile(companyId);
    });
  }

  // =========================================================
  // Save Company Profile
  // =========================================================

  save(): void {

    // Prevent saving during loading or an active request.

    if (this.isLoading() || this.isSaving()) {
      return;
    }

    const companyId = this.companyId();
    if (companyId === null || companyId !== this.loadedCompanyId) {
      this.notificationService.error(
        'Select a company and load its profile before saving.',
        { title: 'Company selection required' }
      );
      return;
    }

    // Validate all form controls before submission.

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;
    }

    // Avoid unnecessary API requests.

    if (this.form.pristine) {
      return;
    }

    // RowVersion is required for optimistic concurrency.

    if (!this.rowVersion) {

      this.notificationService.error(
        'The company profile version is unavailable. Refresh the page and try again.',
        {
          title: 'Profile version unavailable'
        }
      );

      return;
    }

    const value = this.form.getRawValue();

    // =======================================================
    // Build Update Request
    // =======================================================

    const request: UpdateCompanyProfileRequest = {

      name:
        value.name.trim(),

      legalName:
        this.toNullable(value.legalName),

      registrationNumber:
        this.toNullable(value.registrationNumber),

      taxRegistrationNumber:
        this.toNullable(value.taxRegistrationNumber),

      phone:
        this.toNullable(value.phone),

      email:
        this.toNullable(value.email),

      website:
        this.toNullable(value.website),

      addressLine1:
        this.toNullable(value.addressLine1),

      addressLine2:
        this.toNullable(value.addressLine2),

      city:
        this.toNullable(value.city),

      stateOrProvince:
        this.toNullable(value.stateOrProvince),

      postalCode:
        this.toNullable(value.postalCode),

      countryCode:
        value.countryCode
          .trim()
          .toUpperCase(),

      currencyCode:
        value.currencyCode
          .trim()
          .toUpperCase(),

      timeZoneId:
        value.timeZoneId.trim(),

      logoUrl:
        this.toNullable(value.logoUrl),

      rowVersion:
        this.rowVersion
    };

    // =======================================================
    // Submit Update Request
    // =======================================================

    this.isSaving.set(true);

    this.companyService
      .updateProfile(
        companyId,
        request
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({

        next: company => {

          // Apply updated server response, including RowVersion.

          if (this.companyId() !== companyId || company.id !== companyId) {
            return;
          }

          this.applyProfile(company);
          this.loadedCompanyId = companyId;

          // Synchronize the active company only after the API confirms the update.
          // The service ignores responses for a different company.
          this.workspaceContext.synchronizeCompany(
            company.id,
            company.name,
            company.code
          );

          // Show centralized success notification.

          this.notificationService.success(
            'Company profile updated successfully.',
            {
              title: 'Changes saved successfully'
            }
          );
        },

        error: (error: HttpErrorResponse) => {

          // HTTP 409: Concurrent modification.

          if (error.status === 409) {

            this.notificationService.error(
              'This company profile was updated by another user. Refresh the page before saving again.',
              {
                title: 'Concurrent modification detected'
              }
            );

            return;
          }

          // HTTP 403: Insufficient permission.

          if (error.status === 403) {

            this.notificationService.error(
              'You do not have permission to update this company profile.',
              {
                title: 'Permission denied'
              }
            );

            return;
          }

          // HTTP 404: Company does not exist.

          if (error.status === 404) {

            this.notificationService.error(
              'The company profile could not be found.',
              {
                title: 'Company not found'
              }
            );

            return;
          }

          // General API/network failure.

          this.notificationService.error(
            'Unable to save the company profile. Please try again.',
            {
              title: 'Unable to save changes'
            }
          );
        }
      });
  }

  // =========================================================
  // Reload Company Profile
  // =========================================================

  reload(): void {

    if (this.isLoading() || this.isSaving()) {
      return;
    }

    const companyId = this.companyId();
    if (companyId === null) {
      this.loadError.set('Select a company to view its profile.');
      return;
    }

    this.profileLoadSubscription?.unsubscribe();
    this.loadProfile(companyId);
  }

  // =========================================================
  // Load Company Profile
  // =========================================================

  private loadProfile(companyId: number): void {

    this.loadedCompanyId = null;
    this.rowVersion = '';
    this.isLoading.set(true);

    this.loadError.set(null);

    this.profileLoadSubscription = this.companyService
      .getProfile(companyId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({

        next: company => {
          if (this.companyId() !== companyId || company.id !== companyId) {
            return;
          }

          this.applyProfile(company);
          this.loadedCompanyId = companyId;
        },

        error: (error: HttpErrorResponse) => {

          if (error.status === 403) {

            this.loadError.set(
              'You do not have permission to view this company profile.'
            );

            return;
          }

          if (error.status === 404) {

            this.loadError.set(
              'The company profile could not be found.'
            );

            return;
          }

          this.loadError.set(
            'Unable to load the company profile. Please try again.'
          );
        }
      });
  }

  // =========================================================
  // Apply API Response
  // =========================================================

  private applyProfile(
    company: Company
  ): void {

    this.companyCode.set(
      company.code
    );

    this.isActive.set(
      company.isActive
    );

    // Store latest concurrency token.

    this.rowVersion =
      company.rowVersion;

    // Populate form with server-confirmed values.

    this.form.reset({

      name:
        company.name,

      legalName:
        company.legalName ?? '',

      registrationNumber:
        company.registrationNumber ?? '',

      taxRegistrationNumber:
        company.taxRegistrationNumber ?? '',

      phone:
        company.phone ?? '',

      email:
        company.email ?? '',

      website:
        company.website ?? '',

      addressLine1:
        company.addressLine1 ?? '',

      addressLine2:
        company.addressLine2 ?? '',

      city:
        company.city ?? '',

      stateOrProvince:
        company.stateOrProvince ?? '',

      postalCode:
        company.postalCode ?? '',

      countryCode:
        company.countryCode,

      currencyCode:
        company.currencyCode,

      timeZoneId:
        company.timeZoneId,

      logoUrl:
        company.logoUrl ?? ''

    });

    // Reset unsaved-changes state after loading or saving.

    this.form.markAsPristine();
  }

  // =========================================================
  // Helpers
  // =========================================================

  private toNullable(
    value: string
  ): string | null {

    const normalized =
      value.trim();

    return normalized.length > 0
      ? normalized
      : null;
  }
}