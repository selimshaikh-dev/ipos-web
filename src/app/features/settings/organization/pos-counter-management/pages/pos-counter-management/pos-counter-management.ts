
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal
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
  PosCounter
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
  // Until the List API exists, only counters created
  // during the current component session are displayed.
  // =========================================================

  readonly counters = signal<PosCounter[]>([]);

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

      this.cancelWorkspaceRefresh();

      this.counters.set([]);

      this.searchTerm.set('');

      this.isSaving.set(false);

      this.resetFormState();

      this.refreshManagementPermission();

    });

    this.destroyRef.onDestroy(() => {
      this.cancelWorkspaceRefresh();
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
  // Directory Search
  // =========================================================

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
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

    this.resetFormState();
  }

  // =========================================================
  // Create POS Counter
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

            this.counters.update(items => [
              ...items.filter(
                item => item.id !== counter.id
              ),
              counter
            ]);

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