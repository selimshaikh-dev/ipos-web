import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';

import { HttpErrorResponse } from '@angular/common/http';

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  finalize,
  Subscription
} from 'rxjs';

import {
  CreatePosCounterRequest,
  UpdatePosCounterRequest,
  PosCounter,
  PosCounterPagedResult
} from '../../models/pos-counter.model';

import {
  PosCounterService
} from '../../services/pos-counter.service';

import {
  AuthService
} from '../../../../../../core/auth/services/auth.service';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';

import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';

import {
  WorkspaceOptionsService
} from '../../../../../../core/workspace/services/workspace-options.service';

@Component({
  selector: 'app-pos-counter-management',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './pos-counter-management.html',
  styleUrl: './pos-counter-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PosCounterManagement {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);

  private readonly posCounterService =
    inject(PosCounterService);

  private readonly authService = inject(AuthService);

  private readonly notificationService =
    inject(NotificationService);

  private readonly workspaceContext =
    inject(WorkspaceContextService);

  private readonly workspaceOptions =
    inject(WorkspaceOptionsService);

  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // Workspace Context
  // =========================================================

  readonly companyId = this.workspaceContext.companyId;

  readonly companyName = this.workspaceContext.companyName;

  readonly branchId = this.workspaceContext.branchId;

  readonly branchName = this.workspaceContext.branchName;

  // =========================================================
  // Permissions
  // =========================================================

  readonly canManageCounters = signal(false);

  // =========================================================
  // Counter State
  //
  // Records are loaded from the selected branch via the List API.
  // Search remains client-side until the directory HTML is upgraded.
  // =========================================================

  readonly counters = signal<PosCounter[]>([]);

  readonly isLoadingCounters = signal(false);

  readonly countersLoadError = signal<string | null>(null);

  readonly pageNumber = signal(1);

  readonly pageSize = signal(20);

  readonly totalCount = signal(0);

  readonly totalPages = signal(0);

  readonly hasPreviousPage = signal(false);

  readonly hasNextPage = signal(false);

  private listSubscription?: Subscription;

  private listRequestSequence = 0;

  readonly totalCounters = computed(
    () => this.counters().length
  );

  readonly activeCounters = computed(
    () => this.counters().filter(
      counter => counter.isActive
    ).length
  );

  readonly inactiveCounters = computed(
    () => this.counters().filter(
      counter => !counter.isActive
    ).length
  );

  readonly searchTerm = signal('');

  readonly filteredCounters = computed(() => {

    const query = this.searchTerm()
      .trim()
      .toLocaleLowerCase();

    if (!query) {
      return this.counters();
    }

    return this.counters().filter(counter =>
      [
        counter.code,
        counter.name,
        counter.deviceIdentifier
      ].some(value =>
        value?.toLocaleLowerCase().includes(query)
      )
    );
  });

  // =========================================================
  // Form State
  // =========================================================

  readonly isFormOpen = signal(false);

  readonly isSaving = signal(false);

  readonly formError = signal<string | null>(null);

  readonly formMode = signal<'create' | 'edit'>('create');

  readonly editingCounter = signal<PosCounter | null>(null);

  readonly isLoadingCounterDetails = signal(false);

  readonly counterDetailsError = signal<string | null>(null);

  private detailsSubscription?: Subscription;

  private detailsRequestSequence = 0;

  private saveSubscription?: Subscription;

  private workspaceRefreshSubscription?: Subscription;

  private workspaceRefreshSequence = 0;

  // =========================================================
  // Reactive Form
  // =========================================================

  readonly form = this.formBuilder.nonNullable.group({

    name: [
      '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(200)
      ]
    ],

    deviceIdentifier: [
      '',
      [
        Validators.maxLength(200),
        Validators.pattern(/^[\x00-\x7F]*$/)
      ]
    ],

    defaultWarehouseId: ['']

  });

  // =========================================================
  // Constructor
  // =========================================================

  constructor() {

    this.refreshManagementPermission();

    effect(() => {

      // Observe the selected company, branch and
      // authentication session.
      this.companyId();
      this.branchId();
      this.authService.sessionGenerationSignal();

      // Prevent responses from an old workspace context.
      this.saveSubscription?.unsubscribe();

      this.cancelCounterDetails();
      this.cancelCounterLoad();

      this.cancelWorkspaceRefresh();

      this.counters.set([]);
      this.pageNumber.set(1);

      this.searchTerm.set('');

      this.isSaving.set(false);

      this.resetFormState();

      this.refreshManagementPermission();

      // Prevent signals read during HTTP setup from becoming effect dependencies.
      untracked(() => this.loadCounters());

    });

    this.destroyRef.onDestroy(() => {
      this.cancelWorkspaceRefresh();
      this.cancelCounterDetails();
      this.cancelCounterLoad();
    });
  }

  // =========================================================
  // Permissions
  // =========================================================

  private refreshManagementPermission(): void {

    const user = this.authService.getCurrentUser();

    this.canManageCounters.set(
      this.authService.isAuthenticated() &&
      (user?.roles.includes('SuperAdmin') ?? false)
    );
  }

  // =========================================================
  // Workspace Validation
  // =========================================================

  readonly hasSelectedBranch = computed(
    () =>
      this.companyId() !== null &&
      this.branchId() !== null
  );

  // =========================================================
  // Server-side Counter Directory
  // =========================================================

  loadCounters(): void {
    this.cancelCounterLoad();

    const companyId = this.companyId();
    const branchId = this.branchId();
    const userId = this.authService.getCurrentUser()?.userId;
    const generation = this.authService.getSessionGeneration();

    this.counters.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
    this.hasPreviousPage.set(false);
    this.hasNextPage.set(false);
    this.countersLoadError.set(null);

    if (
      companyId === null || companyId <= 0 ||
      branchId === null || branchId <= 0 ||
      !userId || !this.authService.isAuthenticated()
    ) {
      this.isLoadingCounters.set(false);
      return;
    }

    const sequence = ++this.listRequestSequence;
    this.isLoadingCounters.set(true);

    this.listSubscription = this.posCounterService
      .getPosCounters(branchId, {
        includeInactive: true,
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize()
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: PosCounterPagedResult) => {
          if (
            sequence !== this.listRequestSequence ||
            !this.isCurrentSession(companyId, branchId, generation, userId)
          ) {
            return;
          }

          if (
            !response || !Array.isArray(response.items) ||
            !Number.isSafeInteger(response.totalCount) || response.totalCount < 0 ||
            !Number.isSafeInteger(response.totalPages) || response.totalPages < 0 ||
            !Number.isSafeInteger(response.pageNumber) || response.pageNumber < 1 ||
            !Number.isSafeInteger(response.pageSize) || response.pageSize < 1 ||
            response.items.some(counter => counter.branchId !== branchId)
          ) {
            this.countersLoadError.set('The server returned an invalid counter directory.');
            this.isLoadingCounters.set(false);
            return;
          }

          this.counters.set(response.items);
          this.totalCount.set(response.totalCount);
          this.totalPages.set(response.totalPages);
          this.pageNumber.set(response.pageNumber);
          this.hasPreviousPage.set(response.hasPreviousPage);
          this.hasNextPage.set(response.hasNextPage);
          this.isLoadingCounters.set(false);
        },
        error: (error: HttpErrorResponse) => {
          if (
            sequence !== this.listRequestSequence ||
            !this.isCurrentSession(companyId, branchId, generation, userId)
          ) {
            return;
          }

          this.isLoadingCounters.set(false);
          this.countersLoadError.set(
            error.status === 403
              ? 'You do not have permission to view POS counters.'
              : error.status === 404
                ? 'The selected branch could not be found.'
                : 'Unable to load POS counters. Please retry.'
          );
        }
      });
  }

  goToCounterPage(page: number): void {
    if (
      !Number.isSafeInteger(page) || page < 1 ||
      page === this.pageNumber() ||
      (this.totalPages() > 0 && page > this.totalPages())
    ) {
      return;
    }

    this.pageNumber.set(page);
    this.loadCounters();
  }

  retryCounterLoad(): void {
    this.loadCounters();
  }

  private cancelCounterLoad(): void {
    ++this.listRequestSequence;
    this.listSubscription?.unsubscribe();
    this.listSubscription = undefined;
    this.isLoadingCounters.set(false);
  }

  // =========================================================
  // Directory Search
  // =========================================================

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  // =========================================================
  // GetById / Open Edit Form
  // =========================================================

  openEdit(counterId: number): void {
    this.refreshManagementPermission();
    if (
      !this.canManageCounters() || !this.hasSelectedBranch() ||
      this.isSaving() || !Number.isSafeInteger(counterId) || counterId <= 0
    ) {
      return;
    }

    const companyId = this.companyId();
    const branchId = this.branchId();
    const userId = this.authService.getCurrentUser()?.userId;
    const generation = this.authService.getSessionGeneration();
    if (companyId === null || branchId === null || !userId) {
      return;
    }

    this.cancelCounterDetails();
    this.resetFormState();
    this.counterDetailsError.set(null);
    this.isLoadingCounterDetails.set(true);
    const sequence = ++this.detailsRequestSequence;

    this.detailsSubscription = this.posCounterService
      .getPosCounterById(branchId, counterId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: counter => {
          if (
            sequence !== this.detailsRequestSequence ||
            !this.isCurrentSession(companyId, branchId, generation, userId)
          ) {
            return;
          }
          this.isLoadingCounterDetails.set(false);
          if (
            !counter || counter.id !== counterId ||
            counter.branchId !== branchId || !counter.rowVersion ||
            !counter.code
          ) {
            this.counterDetailsError.set('The server returned an invalid POS counter.');
            return;
          }
          this.editingCounter.set(counter);
          this.formMode.set('edit');
          this.form.reset({
            name: counter.name,
            deviceIdentifier: counter.deviceIdentifier ?? '',
            defaultWarehouseId: counter.defaultWarehouseId === null
              ? '' : String(counter.defaultWarehouseId)
          });
          this.isFormOpen.set(true);
        },
        error: (error: HttpErrorResponse) => {
          if (
            sequence !== this.detailsRequestSequence ||
            !this.isCurrentSession(companyId, branchId, generation, userId)
          ) {
            return;
          }
          this.isLoadingCounterDetails.set(false);
          this.counterDetailsError.set(
            error.status === 403
              ? 'You do not have permission to view this POS counter.'
              : error.status === 404
                ? 'The selected POS counter could not be found.'
                : 'Unable to load POS counter details. Please retry.'
          );
        }
      });
  }

  private cancelCounterDetails(): void {
    ++this.detailsRequestSequence;
    this.detailsSubscription?.unsubscribe();
    this.detailsSubscription = undefined;
    this.isLoadingCounterDetails.set(false);
  }

  // =========================================================
  // Open Create Form
  // =========================================================

  openCreate(): void {

    this.refreshManagementPermission();

    if (
      !this.canManageCounters() ||
      !this.hasSelectedBranch() ||
      this.isSaving()
    ) {
      return;
    }

    this.cancelCounterDetails();
    this.resetFormState();

    this.form.reset({
      name: '',
      deviceIdentifier: '',
      defaultWarehouseId: ''
    });

    this.isFormOpen.set(true);
  }

  // =========================================================
  // Close Create Form
  // =========================================================

  closeForm(): void {

    if (this.isSaving()) {
      return;
    }

    this.cancelCounterDetails();
    this.resetFormState();
  }

  // =========================================================
  // Create or Update POS Counter
  // =========================================================

  saveCounter(): void {

    this.refreshManagementPermission();

    if (
      !this.canManageCounters() ||
      !this.hasSelectedBranch() ||
      !this.isFormOpen() ||
      this.isSaving()
    ) {
      return;
    }

    const companyId = this.companyId();

    const branchId = this.branchId();

    if (
      companyId === null ||
      branchId === null ||
      companyId <= 0 ||
      branchId <= 0
    ) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    const name = value.name.trim();

    if (!name) {

      this.form.controls.name.setErrors({
        required: true
      });

      this.form.controls.name.markAsTouched();

      return;
    }

    // The warehouse field is optional.
    // Reject non-integer or unsafe numeric identifiers.
    const warehouseText =
      value.defaultWarehouseId.trim();

    let defaultWarehouseId: number | null = null;

    if (warehouseText) {

      const parsed = Number(warehouseText);

      if (
        !Number.isSafeInteger(parsed) ||
        parsed <= 0
      ) {

        this.formError.set(
          'Enter a valid default warehouse ID.'
        );

        return;
      }

      defaultWarehouseId = parsed;
    }

    const requestedUserId =
      this.authService.getCurrentUser()?.userId;

    const sessionGeneration =
      this.authService.getSessionGeneration();

    if (!requestedUserId) {
      return;
    }

    const request: CreatePosCounterRequest = {
      name,
      deviceIdentifier:
        this.toNullable(value.deviceIdentifier),
      defaultWarehouseId
    };

    this.formError.set(null);

    if (this.formMode() === 'edit') {
      this.updateCounter(companyId, branchId, requestedUserId, sessionGeneration, request);
      return;
    }

    this.isSaving.set(true);

    this.saveSubscription =
      this.posCounterService
        .createPosCounter(branchId, request)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe({

          next: counter => {

            if (
              !this.isCurrentSession(
                companyId,
                branchId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            if (
              counter.branchId !== branchId ||
              !counter.id ||
              !counter.code ||
              !counter.rowVersion
            ) {

              this.formError.set(
                'The server returned an invalid POS counter record.'
              );

              return;
            }

            // Reload the authoritative server directory after creation.
            this.pageNumber.set(1);
            this.loadCounters();

            this.resetFormState();

            this.notificationService.success(
              'POS counter created successfully.',
              {
                title: 'Counter created'
              }
            );

            this.refreshAuthorizedWorkspace(
              companyId,
              branchId,
              requestedUserId,
              sessionGeneration
            );
          },

          error: (error: HttpErrorResponse) => {

            if (
              this.isCurrentSession(
                companyId,
                branchId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              this.handleSaveError(error);
            }
          }

        });
  }

  // =========================================================
  // Update POS Counter with optimistic concurrency
  // =========================================================

  private updateCounter(
    companyId: number,
    branchId: number,
    userId: string,
    generation: number,
    values: CreatePosCounterRequest
  ): void {
    const current = this.editingCounter();
    if (!current || current.branchId !== branchId || !current.rowVersion) {
      this.formError.set('Counter details are missing. Reopen the counter and try again.');
      return;
    }

    const request: UpdatePosCounterRequest = {
      ...values,
      rowVersion: current.rowVersion
    };

    this.isSaving.set(true);
    this.saveSubscription = this.posCounterService
      .updatePosCounter(branchId, current.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: updated => {
          if (!this.isCurrentSession(companyId, branchId, generation, userId)) {
            return;
          }
          if (
            !updated || updated.id !== current.id ||
            updated.branchId !== branchId || !updated.rowVersion || !updated.code
          ) {
            this.formError.set('The server returned an invalid updated POS counter.');
            return;
          }
          this.resetFormState();
          this.loadCounters();
          this.notificationService.success('POS counter updated successfully.', {
            title: 'Counter updated'
          });
        },
        error: (error: HttpErrorResponse) => {
          if (!this.isCurrentSession(companyId, branchId, generation, userId)) {
            return;
          }
          this.formError.set(
            error.status === 409
              ? 'The counter was changed by another user or its warehouse is unavailable. Reopen the counter to load the latest information.'
              : error.status === 400
                ? 'Invalid counter information. Review the form and try again.'
                : error.status === 403
                  ? 'You do not have permission to update POS counters.'
                  : error.status === 404
                    ? 'The counter or selected warehouse could not be found.'
                    : 'Unable to update the POS counter. Please try again.'
          );
        }
      });
  }

  // =========================================================
  // Refresh Authorized Workspace Options
  // =========================================================

  private refreshAuthorizedWorkspace(
    companyId: number,
    branchId: number,
    requestedUserId: string,
    sessionGeneration: number
  ): void {

    this.workspaceRefreshSubscription?.unsubscribe();

    const sequence = ++this.workspaceRefreshSequence;

    this.workspaceRefreshSubscription =
      this.workspaceOptions
        .refreshOptions()
        .pipe(
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({

          next: response => {

            if (
              sequence !== this.workspaceRefreshSequence ||
              !this.isCurrentSession(
                companyId,
                branchId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            if (!Array.isArray(response?.companies)) {

              this.notifyWorkspaceRefreshFailure();

              return;
            }

            const company = response.companies.find(
              item => item.id === companyId
            );

            if (
              !company ||
              !Array.isArray(company.branches)
            ) {

              this.notifyWorkspaceRefreshFailure();

              return;
            }

            const synchronized =
              this.workspaceContext
                .synchronizeAuthorizedBranches(company);

            if (!synchronized) {
              this.notifyWorkspaceRefreshFailure();
            }
          },

          error: () => {

            if (
              sequence !== this.workspaceRefreshSequence ||
              !this.isCurrentSession(
                companyId,
                branchId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            this.notifyWorkspaceRefreshFailure();
          }

        });
  }

  private notifyWorkspaceRefreshFailure(): void {

    this.notificationService.error(
      'The counter was created, but workspace options could not be refreshed. Reload the application to update the workspace selector.',
      {
        title: 'Workspace refresh needed'
      }
    );
  }

  private cancelWorkspaceRefresh(): void {

    ++this.workspaceRefreshSequence;

    this.workspaceRefreshSubscription?.unsubscribe();

    this.workspaceRefreshSubscription = undefined;
  }

  // =========================================================
  // Authentication Session Validation
  // =========================================================

  private isCurrentSession(
    companyId: number,
    branchId: number,
    generation: number,
    userId: string
  ): boolean {

    return (
      this.authService.isAuthenticated() &&
      this.companyId() === companyId &&
      this.branchId() === branchId &&
      this.authService.getCurrentUser()?.userId === userId &&
      this.authService.getSessionGeneration() === generation
    );
  }

  // =========================================================
  // Error Handling
  // =========================================================

  private handleSaveError(
    error: HttpErrorResponse
  ): void {

    if (error.status === 400) {

      this.formError.set(
        'The submitted POS counter information is invalid. Review the form and try again.'
      );

    } else if (error.status === 403) {

      this.formError.set(
        'You do not have permission to create POS counters.'
      );

    } else if (error.status === 404) {

      this.formError.set(
        'The selected branch or default warehouse could not be found.'
      );

    } else if (error.status === 409) {

      this.formError.set(
        'Unable to generate a unique POS counter code. Please retry.'
      );

    } else {

      this.formError.set(
        'Unable to create the POS counter. Please try again.'
      );
    }
  }

  // =========================================================
  // Reset Form
  // =========================================================

  private resetFormState(): void {

    this.isFormOpen.set(false);
    this.formMode.set('create');
    this.editingCounter.set(null);

    this.formError.set(null);

    this.form.reset({
      name: '',
      deviceIdentifier: '',
      defaultWarehouseId: ''
    });

    this.form.markAsPristine();

    this.form.markAsUntouched();
  }

  // =========================================================
  // Helpers
  // =========================================================

  private toNullable(
    value: string
  ): string | null {

    const normalized = value.trim();

    return normalized.length > 0
      ? normalized
      : null;
  }

  trackCounter(
    _index: number,
    counter: PosCounter
  ): number {

    return counter.id;
  }
}