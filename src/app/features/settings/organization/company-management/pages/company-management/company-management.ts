import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription, switchMap } from 'rxjs';

import {
  Company,
  CreateCompanyRequest,
  ChangeCompanyStatusRequest,
  CompanyListItem,
  CompanyListQuery,
  CompanyPagedResult,
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

  // Profile selection is local to this page. It never changes the workspace.
  // Page-level navigation is local UI state, not tenant/workspace selection.
  readonly activeView = signal<'directory' | 'profile'>('directory');
  readonly activeSection = signal<'business' | 'contact' | 'address' | 'regional' | 'branding'>('business');

  showDirectory(): void {
    if (this.isSaving() || this.isStatusUpdating()) return;
    this.activeView.set('directory');
  }

  showProfile(): void {
    if (this.selectedCompanyId() === null) return;
    this.activeView.set('profile');
  }

  setProfileSection(section: 'business' | 'contact' | 'address' | 'regional' | 'branding'): void {
    this.activeSection.set(section);
  }

  readonly selectedCompanyId = signal<number | null>(null);
  readonly isManualSelection = signal(false);

  private loadedCompanyId: number | null = null;
  private profileLoadSubscription?: Subscription;

  selectCompany(company: CompanyListItem): void {
    if (this.isLoading() || this.isSaving() || this.isStatusUpdating()) {
      return;
    }

    if (this.selectedCompanyId() === company.id) {
      this.activeView.set('profile');
      return;
    }

    if (this.form.dirty && !window.confirm(
      'You have unsaved profile changes. Discard them and open another company?'
    )) {
      return;
    }

    this.isManualSelection.set(true);
    this.activeSection.set('business');
    this.activeView.set('profile');
    this.selectedCompanyId.set(company.id);
    this.resetAndLoadSelectedProfile(company.id);
  }

  selectWorkspaceCompany(): void {
    if (this.isLoading() || this.isSaving() || this.isStatusUpdating()) {
      return;
    }

    const workspaceId = this.companyId();
    if (this.selectedCompanyId() === workspaceId) {
      this.isManualSelection.set(false);
      return;
    }

    if (this.form.dirty && !window.confirm(
      'You have unsaved profile changes. Discard them and return to the workspace company?'
    )) {
      return;
    }

    this.isManualSelection.set(false);
    this.activeSection.set('business');
    this.selectedCompanyId.set(workspaceId);
    this.resetAndLoadSelectedProfile(workspaceId);
  }

  private resetAndLoadSelectedProfile(companyId: number | null): void {
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
  }

  // =========================================================
  // Page State
  // =========================================================

  // =========================================================
  // Company List State
  // =========================================================

  readonly companies = signal<CompanyListItem[]>([]);
  readonly isListLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly totalCompanies = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(10);
  readonly totalPages = signal(0);
  readonly hasPreviousPage = signal(false);
  readonly hasNextPage = signal(false);
  readonly searchCode = signal('');
  readonly searchName = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly sortBy = signal('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  // =========================================================
  // Create Company State and Form
  // =========================================================

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    countryCode: ['', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(2),
      Validators.pattern(/^[A-Za-z]{2}$/)
    ]],
    currencyCode: ['', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(3),
      Validators.pattern(/^[A-Za-z]{3}$/)
    ]],
    timeZoneId: ['', [Validators.required, Validators.maxLength(100)]]
  });

  private createSubscription?: Subscription;

  openCreateCompany(): void {
    if (this.isCreating()) {
      return;
    }

    this.createForm.reset();
    this.createError.set(null);
    this.isCreateOpen.set(true);
  }

  cancelCreateCompany(): void {
    if (this.isCreating()) {
      return;
    }

    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  createCompany(): void {
    if (!this.isCreateOpen() || this.isCreating()) {
      return;
    }

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();
    const request: CreateCompanyRequest = {
      // Existing frontend model still requires code; backend generates it.
      code: '',
      name: value.name.trim(),
      countryCode: value.countryCode.trim().toUpperCase(),
      currencyCode: value.currencyCode.trim().toUpperCase(),
      timeZoneId: value.timeZoneId.trim()
    };

    if (!request.name || !request.timeZoneId) {
      this.createForm.markAllAsTouched();
      this.createError.set('Complete all required fields.');
      return;
    }

    this.createError.set(null);
    this.isCreating.set(true);

    this.createSubscription = this.companyService
      .createCompany(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isCreating.set(false))
      )
      .subscribe({
        next: company => {
          this.isCreateOpen.set(false);
          this.createForm.reset();
          this.createError.set(null);

          this.notificationService.success(
            `Company ${company.code} created successfully.`,
            { title: 'Company created' }
          );

          this.pageNumber.set(1);
          this.loadCompanies();
        },
        error: (error: HttpErrorResponse) => {
          let message = 'Unable to create the company. Please try again.';

          if (error.status === 400) {
            message = 'Invalid company details. Review the form and try again.';
          } else if (error.status === 401 || error.status === 403) {
            message = 'You do not have permission to create companies.';
          } else if (error.status === 409) {
            message = 'Unable to allocate a unique company code. Please try again.';
          }

          this.createError.set(message);
          this.notificationService.error(
            message,
            { title: 'Company creation failed' }
          );
        }
      });
  }

  // =========================================================
  // Company Status Management
  // =========================================================

  readonly pendingStatusCompany = signal<CompanyListItem | null>(null);
  readonly isStatusUpdating = signal(false);
  readonly statusError = signal<string | null>(null);

  private statusSubscription?: Subscription;

  requestStatusChange(company: CompanyListItem): void {
    if (this.isStatusUpdating() || this.isSaving() || this.isLoading()) {
      return;
    }

    // A status PATCH changes rowVersion. Do not allow it to silently
    // invalidate unsaved edits to the same company profile.
    if (this.selectedCompanyId() === company.id && this.form.dirty) {
      this.notificationService.error(
        'Save or discard your profile changes before changing this company status.',
        { title: 'Unsaved profile changes' }
      );
      return;
    }

    this.statusError.set(null);
    this.pendingStatusCompany.set(company);
  }

  cancelStatusChange(): void {
    if (this.isStatusUpdating()) {
      return;
    }

    this.pendingStatusCompany.set(null);
    this.statusError.set(null);
  }

  confirmStatusChange(): void {
    const selected = this.pendingStatusCompany();

    if (!selected || this.isStatusUpdating() || this.isSaving() || this.isLoading()) {
      return;
    }

    if (this.selectedCompanyId() === selected.id && this.form.dirty) {
      this.statusError.set('Save or discard profile changes before updating this company status.');
      return;
    }

    const targetStatus = !selected.isActive;
    this.statusError.set(null);
    this.isStatusUpdating.set(true);

    // The list does not expose rowVersion. Fetch the current
    // profile to obtain the server's latest concurrency token.
    this.statusSubscription = this.companyService
      .getProfile(selected.id)
      .pipe(
        switchMap(profile => {
          // The selected profile may have changed while GET was in flight.
          // Never invalidate a locally edited profile's concurrency token.
          if (this.selectedCompanyId() === selected.id && this.form.dirty) {
            throw new Error('UNSAVED_PROFILE_CHANGES');
          }

          if (profile.isActive === targetStatus) {
            // Another user may have already changed the status.
            // Treat the current state as a conflict rather than
            // issuing an unnecessary PATCH.
            throw new Error('STATUS_ALREADY_CHANGED');
          }

          const request: ChangeCompanyStatusRequest = {
            isActive: targetStatus,
            rowVersion: profile.rowVersion
          };

          return this.companyService.changeStatus(selected.id, request);
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isStatusUpdating.set(false))
      )
      .subscribe({
        next: updated => {
          this.pendingStatusCompany.set(null);
          this.statusError.set(null);

          // Keep the active workspace profile in sync without
          // overwriting unsaved changes in its form.
          if (this.selectedCompanyId() === updated.id &&
              this.loadedCompanyId === updated.id) {
            this.isActive.set(updated.isActive);
            this.rowVersion = updated.rowVersion;
          }

          this.notificationService.success(
            `${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}.`,
            { title: 'Company status updated' }
          );

          // Reload from the server to respect active filters,
          // pagination and concurrent directory changes.
          this.loadCompanies();
        },
        error: (error: HttpErrorResponse | Error) => {
          let message = 'Unable to update company status. Please try again.';

          if (error instanceof Error && error.message === 'UNSAVED_PROFILE_CHANGES') {
            message = 'Save or discard profile changes before changing this company status.';
          } else if (error instanceof Error && error.message === 'STATUS_ALREADY_CHANGED') {
            message = 'The company status has already changed. Refresh the list and try again.';
          } else if (error instanceof HttpErrorResponse) {
            if (error.status === 401 || error.status === 403) {
              message = 'You do not have permission to change company status.';
            } else if (error.status === 404) {
              message = 'The company could not be found.';
            } else if (error.status === 409 || error.status === 412) {
              message = 'The company was modified by another user. Refresh the list and try again.';
            } else if (error.status === 400) {
              message = 'The status change request was rejected by the server.';
            }
          }

          this.statusError.set(message);
          this.notificationService.error(
            message,
            { title: 'Status update failed' }
          );
        }
      });
  }

  private listLoadSubscription?: Subscription;

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
      const workspaceId = this.companyId();

      // Only workspaceId is reactive here. Local profile state must not
      // cause this effect to rerun and discard user edits.
      untracked(() => {
        if (this.isManualSelection()) {
          return;
        }

        if (this.isSaving()) {
          this.isManualSelection.set(true);
          return;
        }

        if (this.selectedCompanyId() !== workspaceId && this.form.dirty &&
            !window.confirm(
              'The workspace company changed. Discard unsaved profile changes and open the new workspace company?'
            )) {
          this.isManualSelection.set(true);
          return;
        }

        if (this.selectedCompanyId() === workspaceId &&
            this.loadedCompanyId === workspaceId) {
          return;
        }

        this.selectedCompanyId.set(workspaceId);
        this.resetAndLoadSelectedProfile(workspaceId);
      });
    });

    this.loadCompanies();
  }

  // =========================================================
  // Company List Actions
  // =========================================================

  searchCompanies(code: string, name: string): void {
    this.searchCode.set(code.trim());
    this.searchName.set(name.trim());
    this.pageNumber.set(1);
    this.loadCompanies();
  }

  filterCompanies(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
    this.pageNumber.set(1);
    this.loadCompanies();
  }

  sortCompanies(field: string): void {
    if (this.sortBy() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDirection.set('asc');
    }

    this.pageNumber.set(1);
    this.loadCompanies();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.pageNumber()) {
      return;
    }

    this.pageNumber.set(page);
    this.loadCompanies();
  }

  changePageSize(size: number): void {
    if (!Number.isInteger(size) || size < 1) {
      return;
    }

    this.pageSize.set(size);
    this.pageNumber.set(1);
    this.loadCompanies();
  }

  reloadCompanies(): void {
    this.loadCompanies();
  }

  private loadCompanies(): void {
    // Cancel before setting the next loading state: finalize() of the
    // previous request would otherwise reset the new request's spinner.
    this.listLoadSubscription?.unsubscribe();
    this.isListLoading.set(true);
    this.listError.set(null);

    const query: CompanyListQuery = {
      includeInactive: true,
      code: this.searchCode() || undefined,
      name: this.searchName() || undefined,
      isActive: this.statusFilter() === 'all'
        ? undefined
        : this.statusFilter() === 'active',
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.listLoadSubscription = this.companyService
      .getCompanies(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isListLoading.set(false))
      )
      .subscribe({
        next: (result: CompanyPagedResult) => {
          this.companies.set(result.items);
          this.totalCompanies.set(result.totalCount);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
          this.totalPages.set(result.totalPages);
          this.hasPreviousPage.set(result.hasPreviousPage);
          this.hasNextPage.set(result.hasNextPage);
        },
        error: (error: HttpErrorResponse) => {
          this.companies.set([]);
          this.totalCompanies.set(0);
          this.totalPages.set(0);
          this.hasPreviousPage.set(false);
          this.hasNextPage.set(false);

          this.listError.set(
            error.status === 403
              ? 'You do not have permission to view the company list.'
              : 'Unable to load companies. Please try again.'
          );
        }
      });
  }

  // =========================================================
  // Save Company Profile
  // =========================================================

  save(): void {

    // Prevent saving during loading or an active request.

    if (this.isLoading() || this.isSaving() || this.isStatusUpdating()) {
      return;
    }

    const companyId = this.selectedCompanyId();
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

          if (this.selectedCompanyId() !== companyId || company.id !== companyId) {
            return;
          }

          this.applyProfile(company);
          this.loadedCompanyId = companyId;

          // Synchronize the active company only after the API confirms the update.
          // The service ignores responses for a different company.
          if (this.companyId() === company.id) {
            this.workspaceContext.synchronizeCompany(
              company.id,
              company.name,
              company.code
            );
          }

          // Show centralized success notification.

          this.notificationService.success(
            'Company profile updated successfully.',
            {
              title: 'Changes saved successfully'
            }
          );

          // A renamed company must be reflected in the directory too.
          this.loadCompanies();
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

    const companyId = this.selectedCompanyId();
    if (companyId === null) {
      this.loadError.set('Select a company to view its profile.');
      return;
    }

    if (this.form.dirty && !window.confirm(
      'You have unsaved profile changes. Discard them and reload from the server?'
    )) {
      return;
    }

    this.profileLoadSubscription?.unsubscribe();
    this.form.markAsPristine();
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
          if (this.selectedCompanyId() !== companyId || company.id !== companyId) {
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