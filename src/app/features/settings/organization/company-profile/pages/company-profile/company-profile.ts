import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { finalize } from 'rxjs';

import {
  CompanyProfile as CompanyProfileModel,
  UpdateCompanyProfileRequest
} from '../../models/company-profile.model';

import { CompanyProfileService } from '../../services/company-profile.service';

@Component({
  selector: 'app-company-profile',
  standalone: true,

  imports: [
    ReactiveFormsModule
  ],

  templateUrl: './company-profile.html',
  styleUrl: './company-profile.scss',

  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompanyProfile {

  private readonly formBuilder = inject(FormBuilder);

  private readonly companyProfileService =
    inject(CompanyProfileService);

  private readonly destroyRef =
    inject(DestroyRef);

  // ---------------------------------------------------------
  // Organization Context
  // ---------------------------------------------------------
  // Temporary:
  // Later this value will come from the application's
  // Workspace / Organization Context service.
  // ---------------------------------------------------------

  private readonly companyId = 1;


  // ---------------------------------------------------------
  // Page State
  // ---------------------------------------------------------

  readonly isLoading = signal(true);

  readonly isSaving = signal(false);

  readonly loadError =
    signal<string | null>(null);

  readonly saveError =
    signal<string | null>(null);

  readonly successMessage =
    signal<string | null>(null);

  readonly companyCode =
    signal<string>('');

  readonly isActive =
    signal<boolean>(false);


  // ---------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------

  private rowVersion = '';


  // ---------------------------------------------------------
  // Form
  // ---------------------------------------------------------

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


  // ---------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------

  constructor() {
    this.loadProfile();
  }


  // ---------------------------------------------------------
  // Save Company Profile
  // ---------------------------------------------------------

  save(): void {

    this.successMessage.set(null);
    this.saveError.set(null);

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;
    }

    if (!this.rowVersion) {

      this.saveError.set(
        'The company profile version is unavailable. Refresh the page and try again.'
      );

      return;
    }

    const value =
      this.form.getRawValue();

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

    this.isSaving.set(true);

    this.companyProfileService
      .updateProfile(
        this.companyId,
        request
      )
      .pipe(
        takeUntilDestroyed(
          this.destroyRef
        ),

        finalize(() =>
          this.isSaving.set(false)
        )
      )
      .subscribe({

        next: company => {

          this.applyProfile(company);

          this.successMessage.set(
            'Company profile updated successfully.'
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {

          if (error.status === 409) {

            this.saveError.set(
              'This company profile was updated by another user. Refresh the page before saving again.'
            );

            return;
          }

          if (error.status === 403) {

            this.saveError.set(
              'You do not have permission to update this company profile.'
            );

            return;
          }

          if (error.status === 404) {

            this.saveError.set(
              'The company profile could not be found.'
            );

            return;
          }

          this.saveError.set(
            'Unable to save the company profile. Please try again.'
          );
        }
      });
  }


  // ---------------------------------------------------------
  // Reload
  // ---------------------------------------------------------

  reload(): void {
    this.loadProfile();
  }


  // ---------------------------------------------------------
  // Load Company Profile
  // ---------------------------------------------------------

  private loadProfile(): void {

    this.isLoading.set(true);

    this.loadError.set(null);
    this.saveError.set(null);
    this.successMessage.set(null);

    this.companyProfileService
      .getProfile(this.companyId)
      .pipe(
        takeUntilDestroyed(
          this.destroyRef
        ),

        finalize(() =>
          this.isLoading.set(false)
        )
      )
      .subscribe({

        next: company => {
          this.applyProfile(company);
        },

        error: (
          error: HttpErrorResponse
        ) => {

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


  // ---------------------------------------------------------
  // Apply API Response
  // ---------------------------------------------------------

  private applyProfile(
    company: CompanyProfileModel
  ): void {

    this.companyCode.set(
      company.code
    );

    this.isActive.set(
      company.isActive
    );

    this.rowVersion =
      company.rowVersion;

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

    this.form.markAsPristine();
  }


  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------

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