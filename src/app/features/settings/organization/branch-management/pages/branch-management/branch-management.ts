import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';

import { DOCUMENT } from '@angular/common';

import {
  HttpErrorResponse
} from '@angular/common/http';

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
  Branch,
  CreateBranchRequest,
  UpdateBranchRequest
} from '../../models/branch.model';

import {
  BranchService
} from '../../services/branch.service';

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

// =========================================================
// Types
// =========================================================

type BranchFormMode = 'create' | 'edit';

@Component({
  selector: 'app-branch-management',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './branch-management.html',
  styleUrl: './branch-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BranchManagement {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);

  private readonly branchService = inject(BranchService);

  private readonly authService = inject(AuthService);

  private readonly notificationService =
    inject(NotificationService);

  private readonly workspaceContext =
    inject(WorkspaceContextService);

  private readonly workspaceOptions =
    inject(WorkspaceOptionsService);

  private readonly destroyRef = inject(DestroyRef);

  private readonly document = inject(DOCUMENT);

  private readonly host = inject(ElementRef<HTMLElement>);

  // =========================================================
  // Workspace State
  // =========================================================

  readonly companyId = this.workspaceContext.companyId;

  readonly companyName = this.workspaceContext.companyName;

  private loadedCompanyId: number | null = null;

  // =========================================================
  // Request Subscriptions
  // =========================================================

  private branchLoadSubscription?: Subscription;

  private branchSaveSubscription?: Subscription;

  private branchStatusSubscription?: Subscription;

  private workspaceRefreshSubscription?: Subscription;

  private workspaceRefreshSequence = 0;

  // =========================================================
  // Branch List State
  // =========================================================

  readonly branches = signal<Branch[]>([]);

  readonly isLoading = signal(false);

  readonly loadError = signal<string | null>(null);

  readonly hasLoaded = signal(false);

  readonly totalBranches = computed(
    () => this.branches().length
  );

  readonly activeBranches = computed(
    () => this.branches().filter(branch => branch.isActive).length
  );

  readonly inactiveBranches = computed(
    () => this.branches().filter(branch => !branch.isActive).length
  );

  readonly headOffice = computed(
    () => this.branches().find(branch => branch.isHeadOffice) ?? null
  );

  readonly hasBranches = computed(
    () => this.branches().length > 0
  );

  // Client-side directory search and status filtering.
  readonly searchTerm = signal('');

  readonly statusFilter = signal<'all' | 'active' | 'inactive' | 'head-office'>('all');

  readonly filteredBranches = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const filter = this.statusFilter();

    return this.branches().filter(branch => {
      const matchesStatus =
        filter === 'all' ||
        (filter === 'active' && branch.isActive) ||
        (filter === 'inactive' && !branch.isActive) ||
        (filter === 'head-office' && branch.isHeadOffice);

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        branch.name,
        branch.code,
        branch.city,
        branch.stateOrProvince,
        branch.phone,
        branch.email,
        branch.addressLine1,
        branch.addressLine2,
        branch.postalCode,
        branch.countryCode
      ].some(value => value?.toLocaleLowerCase().includes(query));
    });
  });

  readonly filteredBranchCount = computed(
    () => this.filteredBranches().length
  );

  // Store an ID, not a stale DTO, so details reflect list updates.
  readonly detailsBranchId = signal<number | null>(null);

  readonly detailsBranch = computed(() => {
    const id = this.detailsBranchId();
    return id === null
      ? null
      : this.branches().find(branch => branch.id === id) ?? null;
  });

  readonly isDetailsOpen = computed(() => this.detailsBranch() !== null);

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  setStatusFilter(value: string): void {
    if (
      value === 'all' ||
      value === 'active' ||
      value === 'inactive' ||
      value === 'head-office'
    ) {
      this.statusFilter.set(value);
    }
  }

  clearDirectoryFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
  }

  openDetails(branch: Branch): void {
    const companyId = this.companyId();
    if (
      !this.isCurrentCompanyLoaded() ||
      companyId === null ||
      branch.companyId !== companyId ||
      this.isSaving() ||
      this.isChangingStatus() ||
      this.isStatusConfirmationOpen()
    ) {
      return;
    }

    const exists = this.branches().some(
      item => item.id === branch.id && item.companyId === companyId
    );

    if (exists) {
      this.detailsBranchId.set(branch.id);
    }
  }

  closeDetails(): void {
    this.detailsBranchId.set(null);
  }

  readonly canManageBranches = signal(false);

  // =========================================================
  // Form State
  // =========================================================

  readonly formMode = signal<BranchFormMode | null>(null);

  readonly selectedBranch = signal<Branch | null>(null);

  readonly isSaving = signal(false);

  readonly formError = signal<string | null>(null);

  readonly isFormOpen = computed(
    () => this.formMode() !== null
  );

  readonly isEditing = computed(
    () => this.formMode() === 'edit'
  );

  private editingRowVersion = '';

  // =========================================================
  // Status Confirmation State
  // =========================================================

  readonly pendingStatusBranch =
    signal<Branch | null>(null);

  readonly isChangingStatus = signal(false);

  readonly statusError = signal<string | null>(null);

  readonly isStatusConfirmationOpen = computed(
    () => this.pendingStatusBranch() !== null
  );

  readonly pendingStatusAction = computed(() => {
    const branch = this.pendingStatusBranch();

    return branch
      ? (branch.isActive ? 'deactivate' : 'activate')
      : null;
  });

  // =========================================================
  // Dialog Accessibility State
  // =========================================================

  private previousFocusedElement: HTMLElement | null = null;

  private dialogFocusTimer:
    ReturnType<typeof setTimeout> | null = null;

  private restoreFocusTimer:
    ReturnType<typeof setTimeout> | null = null;

  private readonly focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

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

    isHeadOffice: [false],

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
      Validators.maxLength(2)
    ]

  });

  // =========================================================
  // Constructor
  // =========================================================

  constructor() {

    this.refreshManagementPermission();

    effect(() => {

      const companyId = this.companyId();

      // Observe the authentication lifecycle.
      // The effect also reruns when the session
      // changes without a company ID change.

      const sessionGeneration =
        this.authService.sessionGenerationSignal();

      // Cancel requests from the previous context.

      this.branchLoadSubscription?.unsubscribe();

      this.branchSaveSubscription?.unsubscribe();

      this.branchStatusSubscription?.unsubscribe();

      this.cancelWorkspaceRefresh();

      // Reset dialog focus state.

      this.clearFocusTimers();

      this.previousFocusedElement = null;

      // Reset company-specific state.

      this.loadedCompanyId = null;

      this.detailsBranchId.set(null);
      this.clearDirectoryFilters();

      this.branches.set([]);

      this.loadError.set(null);

      this.hasLoaded.set(false);

      this.isLoading.set(false);

      this.isSaving.set(false);

      this.isChangingStatus.set(false);

      // Reset form and confirmation state.

      this.pendingStatusBranch.set(null);

      this.statusError.set(null);

      this.resetFormState();

      // Re-evaluate permissions.

      this.refreshManagementPermission();

      if (
        companyId === null ||
        !this.authService.isAuthenticated()
      ) {

        this.loadError.set(
          'Select a company to manage its branches.'
        );

        return;
      }

      // Load branches for the current session.

      this.loadBranches(
        companyId,
        sessionGeneration
      );

    });

    this.destroyRef.onDestroy(() => {

      this.cancelWorkspaceRefresh();

      this.clearFocusTimers();

      this.previousFocusedElement = null;

    });
  }

  // =========================================================
  // Permissions
  // =========================================================

  private refreshManagementPermission(): void {

    const user = this.authService.getCurrentUser();

    this.canManageBranches.set(
      this.authService.isAuthenticated() &&
      (user?.roles.includes('SuperAdmin') ?? false)
    );
  }

  // =========================================================
  // Open Create Form
  // =========================================================

  openCreate(): void {

    this.refreshManagementPermission();

    if (
      !this.canManageBranches() ||
      !this.isCurrentCompanyLoaded() ||
      this.isLoading() ||
      this.isSaving() ||
      this.isChangingStatus() ||
      this.isStatusConfirmationOpen()
    ) {
      return;
    }

    this.resetFormState();

    this.form.reset({
      name: '',
      isHeadOffice: false,
      phone: '',
      email: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      stateOrProvince: '',
      postalCode: '',
      countryCode: ''
    });

    this.form.controls.isHeadOffice.enable({
      emitEvent: false
    });

    this.formMode.set('create');
  }

  // =========================================================
  // Open Edit Form
  // =========================================================

  openEdit(branch: Branch): void {

    this.refreshManagementPermission();

    if (
      !this.canManageBranches() ||
      !this.isCurrentCompanyLoaded() ||
      this.isLoading() ||
      this.isSaving() ||
      this.isChangingStatus() ||
      this.isStatusConfirmationOpen()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (
      companyId === null ||
      branch.companyId !== companyId
    ) {
      return;
    }

    const currentBranch = this.branches().find(
      item => item.id === branch.id
    );

    if (!currentBranch?.rowVersion) {
      return;
    }

    this.resetFormState();

    this.selectedBranch.set(currentBranch);

    this.editingRowVersion = currentBranch.rowVersion;

    this.form.reset({

      name: currentBranch.name,

      isHeadOffice: currentBranch.isHeadOffice,

      phone: currentBranch.phone ?? '',

      email: currentBranch.email ?? '',

      addressLine1: currentBranch.addressLine1 ?? '',

      addressLine2: currentBranch.addressLine2 ?? '',

      city: currentBranch.city ?? '',

      stateOrProvince: currentBranch.stateOrProvince ?? '',

      postalCode: currentBranch.postalCode ?? '',

      countryCode: currentBranch.countryCode ?? ''

    });

    this.form.controls.isHeadOffice.disable({
      emitEvent: false
    });

    this.formMode.set('edit');
  }

  // =========================================================
  // Close Form
  // =========================================================

  closeForm(): void {

    if (!this.isSaving()) {
      this.resetFormState();
    }
  }

  // =========================================================
  // Save Branch
  // =========================================================

  saveBranch(): void {

    this.refreshManagementPermission();

    if (
      !this.canManageBranches() ||
      !this.isCurrentCompanyLoaded() ||
      this.isLoading() ||
      this.isSaving() ||
      this.isChangingStatus() ||
      this.isStatusConfirmationOpen()
    ) {
      return;
    }

    const companyId = this.companyId();

    const mode = this.formMode();

    if (
      companyId === null ||
      mode === null
    ) {
      return;
    }

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;
    }

    if (
      mode === 'edit' &&
      this.form.pristine
    ) {
      return;
    }

    this.formError.set(null);

    const value = this.form.getRawValue();

    const commonFields = {

      name: value.name.trim(),

      phone: this.toNullable(value.phone),

      email: this.toNullable(value.email),

      addressLine1: this.toNullable(value.addressLine1),

      addressLine2: this.toNullable(value.addressLine2),

      city: this.toNullable(value.city),

      stateOrProvince: this.toNullable(value.stateOrProvince),

      postalCode: this.toNullable(value.postalCode),

      countryCode: this.toNullable(
        value.countryCode.toUpperCase()
      )

    };

    if (!commonFields.name) {

      this.form.controls.name.setErrors({
        required: true
      });

      this.form.controls.name.markAsTouched();

      return;
    }

    const requestedUserId =
      this.authService.getCurrentUser()?.userId;

    const sessionGeneration =
      this.authService.getSessionGeneration();

    if (!requestedUserId) {
      return;
    }

    // =======================================================
    // Create Branch
    // =======================================================

    if (mode === 'create') {

      const request: CreateBranchRequest = {

        isHeadOffice: value.isHeadOffice,

        ...commonFields

      };

      this.isSaving.set(true);

      this.branchSaveSubscription =
        this.branchService
          .createBranch(companyId, request)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            finalize(() => this.isSaving.set(false))
          )
          .subscribe({

            next: branch => {

              if (
                !this.isValidMutationContext(
                  companyId,
                  sessionGeneration,
                  requestedUserId
                )
              ) {
                return;
              }

              if (
                branch.companyId !== companyId ||
                !branch.rowVersion
              ) {

                this.formError.set(
                  'The server returned an invalid branch record.'
                );

                return;
              }

              this.branches.update(items => [
                ...items.filter(
                  item => item.id !== branch.id
                ),
                branch
              ]);

              this.resetFormState();

              this.notificationService.success(
                'Branch created successfully.',
                {
                  title: 'Branch created'
                }
              );

              this.refreshAuthorizedWorkspace(
                companyId,
                requestedUserId,
                sessionGeneration
              );
            },

            error: (error: HttpErrorResponse) => {

              if (
                this.isValidMutationContext(
                  companyId,
                  sessionGeneration,
                  requestedUserId
                )
              ) {
                this.handleSaveError(error, 'create');
              }
            }

          });

      return;
    }

    // =======================================================
    // Update Branch
    // =======================================================

    const selectedBranch = this.selectedBranch();

    if (
      !selectedBranch ||
      selectedBranch.companyId !== companyId ||
      !this.editingRowVersion
    ) {

      this.formError.set(
        'The branch version is unavailable. Refresh and try again.'
      );

      return;
    }

    const request: UpdateBranchRequest = {

      ...commonFields,

      rowVersion: this.editingRowVersion

    };

    this.isSaving.set(true);

    this.branchSaveSubscription =
      this.branchService
        .updateBranch(
          companyId,
          selectedBranch.id,
          request
        )
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe({

          next: branch => {

            if (
              !this.isValidMutationContext(
                companyId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            if (
              branch.companyId !== companyId ||
              branch.id !== selectedBranch.id ||
              !branch.rowVersion
            ) {

              this.formError.set(
                'The server returned an invalid branch record.'
              );

              return;
            }

            this.branches.update(items =>
              items.map(item =>
                item.id === branch.id
                  ? branch
                  : item
              )
            );

            this.resetFormState();

            this.notificationService.success(
              'Branch updated successfully.',
              {
                title: 'Changes saved'
              }
            );

            this.refreshAuthorizedWorkspace(
              companyId,
              requestedUserId,
              sessionGeneration
            );
          },

          error: (error: HttpErrorResponse) => {

            if (
              this.isValidMutationContext(
                companyId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              this.handleSaveError(error, 'edit');
            }
          }

        });
  }

  // =========================================================
  // Open Status Confirmation
  // =========================================================

  openStatusConfirmation(branch: Branch): void {

    this.refreshManagementPermission();

    if (
      !this.canManageBranches() ||
      !this.isCurrentCompanyLoaded() ||
      this.isLoading() ||
      this.isSaving() ||
      this.isChangingStatus() ||
      this.isFormOpen() ||
      this.isStatusConfirmationOpen()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (
      companyId === null ||
      branch.companyId !== companyId
    ) {
      return;
    }

    const currentBranch = this.branches().find(
      item => item.id === branch.id
    );

    if (!currentBranch?.rowVersion) {
      return;
    }

    if (
      currentBranch.isActive &&
      currentBranch.isHeadOffice
    ) {

      this.notificationService.error(
        'The head office cannot be deactivated.',
        {
          title: 'Action not allowed'
        }
      );

      return;
    }

    this.clearRestoreFocusTimer();

    const activeElement = this.document.activeElement;

    this.previousFocusedElement =
      activeElement instanceof HTMLElement
        ? activeElement
        : null;

    this.statusError.set(null);

    this.pendingStatusBranch.set(currentBranch);

    this.scheduleDialogInitialFocus();
  }

  // =========================================================
  // Cancel Status Confirmation
  // =========================================================

  cancelStatusConfirmation(): void {

    if (!this.isChangingStatus()) {
      this.closeStatusDialog();
    }
  }

  // =========================================================
  // Confirm Status Change
  // =========================================================

  confirmStatusChange(): void {

    this.refreshManagementPermission();

    if (
      !this.canManageBranches() ||
      !this.isCurrentCompanyLoaded() ||
      this.isLoading() ||
      this.isSaving() ||
      this.isChangingStatus() ||
      this.isFormOpen()
    ) {
      return;
    }

    const companyId = this.companyId();

    const pendingBranch = this.pendingStatusBranch();

    if (
      companyId === null ||
      !pendingBranch
    ) {
      return;
    }

    const currentBranch = this.branches().find(
      item => item.id === pendingBranch.id
    );

    if (
      !currentBranch ||
      currentBranch.companyId !== companyId ||
      !currentBranch.rowVersion ||
      currentBranch.rowVersion !== pendingBranch.rowVersion ||
      currentBranch.isActive !== pendingBranch.isActive
    ) {

      this.statusError.set(
        'Branch information has changed. Cancel and refresh before trying again.'
      );

      return;
    }

    if (
      currentBranch.isActive &&
      currentBranch.isHeadOffice
    ) {

      this.statusError.set(
        'The head office cannot be deactivated.'
      );

      return;
    }

    const requestedUserId =
      this.authService.getCurrentUser()?.userId;

    const sessionGeneration =
      this.authService.getSessionGeneration();

    if (!requestedUserId) {
      return;
    }

    const request = {
      rowVersion: currentBranch.rowVersion
    };

    const operation$ = currentBranch.isActive
      ? this.branchService.deactivateBranch(
          companyId,
          currentBranch.id,
          request
        )
      : this.branchService.activateBranch(
          companyId,
          currentBranch.id,
          request
        );

    this.isChangingStatus.set(true);

    this.statusError.set(null);

    this.branchStatusSubscription = operation$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isChangingStatus.set(false))
      )
      .subscribe({

        next: updatedBranch => {

          if (
            !this.isValidMutationContext(
              companyId,
              sessionGeneration,
              requestedUserId
            )
          ) {
            return;
          }

          if (
            updatedBranch.companyId !== companyId ||
            updatedBranch.id !== currentBranch.id ||
            !updatedBranch.rowVersion ||
            updatedBranch.isActive === currentBranch.isActive
          ) {

            this.statusError.set(
              'The server returned an unexpected branch status.'
            );

            return;
          }

          this.branches.update(items =>
            items.map(item =>
              item.id === updatedBranch.id
                ? updatedBranch
                : item
            )
          );

          this.closeStatusDialog();

          this.notificationService.success(
            updatedBranch.isActive
              ? 'Branch activated successfully.'
              : 'Branch deactivated successfully.',
            {
              title: updatedBranch.isActive
                ? 'Branch activated'
                : 'Branch deactivated'
            }
          );

          this.refreshAuthorizedWorkspace(
            companyId,
            requestedUserId,
            sessionGeneration
          );
        },

        error: (error: HttpErrorResponse) => {

          if (
            this.isValidMutationContext(
              companyId,
              sessionGeneration,
              requestedUserId
            )
          ) {
            this.handleStatusError(error);
          }
        }

      });
  }

  // =========================================================
  // Authorized Workspace Refresh
  // =========================================================

  /**
   * Refresh authorized workspace options after a
   * successful branch mutation.
   *
   * Branch Management API responses are not used
   * as an authorization source.
   */
  private refreshAuthorizedWorkspace(
    companyId: number,
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
              !this.isValidMutationContext(
                companyId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            const companies = response?.companies;

            if (!Array.isArray(companies)) {
              this.notifyWorkspaceRefreshFailure();
              return;
            }

            const selectedCompany = companies.find(
              company => company.id === companyId
            );

            if (
              !selectedCompany ||
              !Array.isArray(selectedCompany.branches)
            ) {
              this.notifyWorkspaceRefreshFailure();
              return;
            }

            const synchronized =
              this.workspaceContext.synchronizeAuthorizedBranches(
                selectedCompany
              );

            if (!synchronized) {
              this.notifyWorkspaceRefreshFailure();
            }
          },

          error: () => {

            if (
              sequence !== this.workspaceRefreshSequence ||
              !this.isValidMutationContext(
                companyId,
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

  // =========================================================
  // Workspace Refresh Failure
  // =========================================================

  private notifyWorkspaceRefreshFailure(): void {

    this.notificationService.error(
      'Branch changes were saved, but the workspace branch selector could not be refreshed. Reload the application to update it.',
      {
        title: 'Workspace refresh needed'
      }
    );
  }

  // =========================================================
  // Cancel Workspace Refresh
  // =========================================================

  private cancelWorkspaceRefresh(): void {

    ++this.workspaceRefreshSequence;

    this.workspaceRefreshSubscription?.unsubscribe();

    this.workspaceRefreshSubscription = undefined;
  }

  // =========================================================
  // Dialog Keyboard Accessibility
  // =========================================================

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {

    if (!this.isStatusConfirmationOpen()) {
      return;
    }

    if (event.key === 'Escape') {

      event.preventDefault();

      event.stopPropagation();

      if (!this.isChangingStatus()) {
        this.cancelStatusConfirmation();
      }

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = this.getDialogElement();

    if (!dialog) {
      return;
    }

    const focusable =
      this.getFocusableDialogElements(dialog);

    if (focusable.length === 0) {

      event.preventDefault();

      dialog.focus();

      return;
    }

    const first = focusable[0];

    const last = focusable[focusable.length - 1];

    const active = this.document.activeElement;

    const inside =
      active instanceof Node &&
      dialog.contains(active);

    if (!inside) {

      event.preventDefault();

      (
        event.shiftKey
          ? last
          : first
      ).focus();

    } else if (
      event.shiftKey &&
      active === first
    ) {

      event.preventDefault();

      last.focus();

    } else if (
      !event.shiftKey &&
      active === last
    ) {

      event.preventDefault();

      first.focus();
    }
  }

  // =========================================================
  // Initial Dialog Focus
  // =========================================================

  private scheduleDialogInitialFocus(): void {

    this.clearDialogFocusTimer();

    this.dialogFocusTimer = setTimeout(() => {

      this.dialogFocusTimer = null;

      if (!this.isStatusConfirmationOpen()) {
        return;
      }

      const dialog = this.getDialogElement();

      if (!dialog) {
        return;
      }

      const cancel =
        dialog.querySelector<HTMLButtonElement>(
          '.confirmation-actions .btn-secondary'
        );

      if (
        cancel &&
        !cancel.disabled
      ) {

        cancel.focus();

        return;
      }

      const focusable =
        this.getFocusableDialogElements(dialog);

      if (focusable.length > 0) {

        focusable[0].focus();

      } else {

        dialog.focus();
      }

    }, 0);
  }

  // =========================================================
  // Close Status Dialog
  // =========================================================

  private closeStatusDialog(): void {

    this.clearDialogFocusTimer();

    this.clearRestoreFocusTimer();

    const previous = this.previousFocusedElement;

    this.previousFocusedElement = null;

    this.pendingStatusBranch.set(null);

    this.statusError.set(null);

    if (previous) {

      this.restoreFocusTimer = setTimeout(() => {

        this.restoreFocusTimer = null;

        if (
          !this.isStatusConfirmationOpen() &&
          previous.isConnected &&
          !previous.hasAttribute('disabled') &&
          !previous.closest('[inert]')
        ) {

          previous.focus();
        }

      }, 0);
    }
  }

  // =========================================================
  // Get Confirmation Dialog Element
  // =========================================================

  /**
   * Explicitly type the host DOM element before
   * calling querySelector with a generic argument.
   *
   * Fixes TS2347:
   * Untyped function calls may not accept type arguments.
   */
  private getDialogElement(): HTMLElement | null {

    const hostElement =
      this.host.nativeElement as HTMLElement;

    return hostElement.querySelector<HTMLElement>(
      '.confirmation-dialog'
    );
  }

  // =========================================================
  // Get Focusable Dialog Elements
  // =========================================================

  private getFocusableDialogElements(
    dialog: HTMLElement
  ): HTMLElement[] {

    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        this.focusableSelector
      )
    ).filter(element =>

      element.getClientRects().length > 0 &&

      element.getAttribute('aria-hidden') !== 'true' &&

      !element.closest('[inert]')

    );
  }

  // =========================================================
  // Clear Dialog Focus Timer
  // =========================================================

  private clearDialogFocusTimer(): void {

    if (this.dialogFocusTimer !== null) {

      clearTimeout(this.dialogFocusTimer);

      this.dialogFocusTimer = null;
    }
  }

  // =========================================================
  // Clear Restore Focus Timer
  // =========================================================

  private clearRestoreFocusTimer(): void {

    if (this.restoreFocusTimer !== null) {

      clearTimeout(this.restoreFocusTimer);

      this.restoreFocusTimer = null;
    }
  }

  // =========================================================
  // Clear Focus Timers
  // =========================================================

  private clearFocusTimers(): void {

    this.clearDialogFocusTimer();

    this.clearRestoreFocusTimer();
  }

  // =========================================================
  // Reload Branches
  // =========================================================

  reload(): void {

    if (
      this.isLoading() ||
      this.isSaving() ||
      this.isChangingStatus()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (companyId === null) {

      this.loadError.set(
        'Select a company to manage its branches.'
      );

      return;
    }

    this.branchLoadSubscription?.unsubscribe();

    this.clearFocusTimers();

    this.previousFocusedElement = null;

    this.pendingStatusBranch.set(null);

    this.statusError.set(null);

    this.resetFormState();

    this.loadBranches(companyId);
  }

  // =========================================================
  // Load Branches
  // =========================================================

  private loadBranches(
    companyId: number,
    sessionGeneration = this.authService.getSessionGeneration()
  ): void {

    const requestedUserId =
      this.authService.getCurrentUser()?.userId;

    this.loadedCompanyId = null;

    this.isLoading.set(true);

    this.loadError.set(null);

    this.hasLoaded.set(false);

    this.branchLoadSubscription =
      this.branchService
        .getBranches(companyId)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isLoading.set(false))
        )
        .subscribe({

          next: branches => {

            if (
              !this.isCurrentSession(
                companyId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            if (
              !Array.isArray(branches) ||
              branches.some(
                branch => branch.companyId !== companyId
              )
            ) {

              this.branches.set([]);

              this.loadError.set(
                'The server returned an invalid branch list.'
              );

              this.notificationService.error(
                'Unable to verify branches for the selected company.',
                {
                  title: 'Invalid server response'
                }
              );

              return;
            }

            this.branches.set(branches);

            this.loadedCompanyId = companyId;

            this.hasLoaded.set(true);
          },

          error: (error: HttpErrorResponse) => {

            if (
              !this.isCurrentSession(
                companyId,
                sessionGeneration,
                requestedUserId
              )
            ) {
              return;
            }

            this.branches.set([]);

            if (error.status === 403) {

              this.loadError.set(
                'You do not have permission to view branches for this company.'
              );

            } else if (error.status === 404) {

              this.loadError.set(
                'The selected company could not be found.'
              );

            } else {

              this.loadError.set(
                'Unable to load branches. Please try again.'
              );
            }
          }

        });
  }

  // =========================================================
  // Save Error Handling
  // =========================================================

  private handleSaveError(
    error: HttpErrorResponse,
    mode: BranchFormMode
  ): void {

    if (error.status === 409) {

      this.formError.set(
        mode === 'create'
          ? 'Unable to generate a unique branch code, or this company already has a head office. Please retry.'
          : 'This branch was modified by another user. Refresh the branch list before editing again.'
      );

    } else if (error.status === 400) {

      this.formError.set(
        'The submitted branch information is invalid. Review the form and try again.'
      );

    } else if (error.status === 403) {

      this.formError.set(
        'You do not have permission to manage branches.'
      );

    } else if (error.status === 404) {

      this.formError.set(
        'The selected company or branch could not be found.'
      );

    } else {

      this.formError.set(
        'Unable to save the branch. Please try again.'
      );
    }
  }

  // =========================================================
  // Status Error Handling
  // =========================================================

  private handleStatusError(
    error: HttpErrorResponse
  ): void {

    if (error.status === 409) {

      this.statusError.set(
        'The branch was changed by another user, or the requested status change is not allowed. Refresh and try again.'
      );

    } else if (error.status === 403) {

      this.statusError.set(
        'You do not have permission to change branch status.'
      );

    } else if (error.status === 404) {

      this.statusError.set(
        'The selected branch could not be found.'
      );

    } else if (error.status === 400) {

      this.statusError.set(
        'The branch status request is invalid.'
      );

    } else {

      this.statusError.set(
        'Unable to change branch status. Please try again.'
      );
    }
  }

  // =========================================================
  // Authentication Session Validation
  // =========================================================

  private isCurrentSession(
    companyId: number,
    generation: number,
    userId: string | undefined
  ): boolean {

    return (
      !!userId &&
      this.authService.isAuthenticated() &&
      this.companyId() === companyId &&
      this.authService.getCurrentUser()?.userId === userId &&
      this.authService.getSessionGeneration() === generation
    );
  }

  // =========================================================
  // Mutation Context Validation
  // =========================================================

  private isValidMutationContext(
    companyId: number,
    generation: number,
    userId: string
  ): boolean {

    return (
      this.loadedCompanyId === companyId &&
      this.hasLoaded() &&
      this.isCurrentSession(
        companyId,
        generation,
        userId
      )
    );
  }

  // =========================================================
  // Reset Form State
  // =========================================================

  private resetFormState(): void {

    this.formMode.set(null);

    this.selectedBranch.set(null);

    this.formError.set(null);

    this.editingRowVersion = '';

    this.form.controls.isHeadOffice.enable({
      emitEvent: false
    });

    this.form.reset();

    this.form.markAsPristine();

    this.form.markAsUntouched();
  }

  // =========================================================
  // Company Load Validation
  // =========================================================

  isCurrentCompanyLoaded(): boolean {

    const companyId = this.companyId();

    return (
      companyId !== null &&
      companyId === this.loadedCompanyId &&
      this.hasLoaded()
    );
  }

  // =========================================================
  // Branch Tracking
  // =========================================================

  trackBranch(
    _index: number,
    branch: Branch
  ): number {

    return branch.id;
  }

  // =========================================================
  // Nullable String Helper
  // =========================================================

  private toNullable(
    value: string
  ): string | null {

    const normalized = value.trim();

    return normalized.length > 0
      ? normalized
      : null;
  }
}