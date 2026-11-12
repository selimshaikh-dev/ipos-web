
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
  CreateRoleRequest,
  RoleDirectoryItem,
  RoleListQuery,
  RolePagedResult,
  UpdateRoleRequest
} from '../../models/role.model';

import {
  RoleService
} from '../../services/role.service';

import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './role-management.html',
  styleUrl: './role-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleManagement {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly roleService = inject(RoleService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  // =========================================================
  // Workspace
  // =========================================================

  readonly companyId = this.workspaceContext.companyId;
  readonly companyName = this.workspaceContext.companyDisplayName;

  // =========================================================
  // Directory State
  // =========================================================

  readonly roles = signal<RoleDirectoryItem[]>([]);
  readonly isLoadingRoles = signal(false);
  readonly directoryError = signal<string | null>(null);

  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);
  readonly hasPreviousPage = signal(false);
  readonly hasNextPage = signal(false);

  readonly searchText = signal('');
  readonly selectedIsActive = signal<boolean | null>(null);
  readonly selectedRoleType = signal<'system' | 'custom' | null>(null);

  // =========================================================
  // Editor State
  // =========================================================

  readonly formMode = signal<'create' | 'edit' | null>(null);
  readonly selectedRole = signal<RoleDirectoryItem | null>(null);
  readonly isSavingRole = signal(false);
  readonly roleFormError = signal<string | null>(null);

  readonly roleForm = this.formBuilder.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],
    name: [
      '',
      [
        Validators.required,
        Validators.maxLength(200)
      ]
    ],
    description: [
      '',
      [Validators.maxLength(1000)]
    ]
  });

  // =========================================================
  // Status State
  // =========================================================

  readonly changingStatusRoleId = signal<number | null>(null);
  readonly roleStatusError = signal<string | null>(null);

  readonly pendingConfirmation = signal<{
    role: RoleDirectoryItem;
    action: 'activate' | 'deactivate';
    companyId: number;
  } | null>(null);

  // =========================================================
  // Request Lifecycle
  // =========================================================

  private directorySubscription: Subscription | null = null;
  private directoryRequestVersion = 0;

  private saveSubscription: Subscription | null = null;
  private saveRequestVersion = 0;

  private statusSubscription: Subscription | null = null;
  private statusRequestVersion = 0;

  constructor() {
    effect(() => {
      const companyId = this.companyId();

      untracked(() => {
        this.resetForCompanyChange();

        if (companyId !== null && companyId > 0) {
          this.loadRoles();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelSaveRequest();
      this.cancelStatusRequest();
    });
  }

  // =========================================================
  // Directory
  // =========================================================

  loadRoles(): void {
    const companyId = this.companyId();

    this.cancelDirectoryRequest();
    const version = this.directoryRequestVersion;

    if (companyId === null || companyId <= 0) {
      this.clearDirectory();
      this.isLoadingRoles.set(false);
      this.directoryError.set(null);
      return;
    }

    const query: RoleListQuery = {
      search: this.searchText().trim() || undefined,
      isActive: this.selectedIsActive() ?? undefined,
      roleType: this.selectedRoleType() ?? undefined,
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingRoles.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.roleService
      .getRoles(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.directoryRequestVersion) {
            this.isLoadingRoles.set(false);
          }
        })
      )
      .subscribe({
        next: (result: RolePagedResult) => {
          if (
            version !== this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.roles.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPages.set(result.totalPages);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
          this.hasPreviousPage.set(result.hasPreviousPage);
          this.hasNextPage.set(result.hasNextPage);
        },
        error: (error: HttpErrorResponse) => {
          if (
            version !== this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.clearDirectory();
          this.directoryError.set(
            this.getApiErrorMessage(
              error,
              'Unable to load roles. Please try again.'
            )
          );
        }
      });
  }

  refreshDirectory(): void {
    this.loadRoles();
  }

  searchRoles(search: string): void {
    this.searchText.set(search.trim());
    this.pageNumber.set(1);
    this.loadRoles();
  }

  filterByStatus(isActive: boolean | null): void {
    this.selectedIsActive.set(isActive);
    this.pageNumber.set(1);
    this.loadRoles();
  }

  filterByRoleType(
    roleType: 'system' | 'custom' | null
  ): void {
    this.selectedRoleType.set(roleType);
    this.pageNumber.set(1);
    this.loadRoles();
  }

  clearFilters(): void {
    this.searchText.set('');
    this.selectedIsActive.set(null);
    this.selectedRoleType.set(null);
    this.pageNumber.set(1);
    this.loadRoles();
  }

  previousPage(): void {
    if (this.isLoadingRoles() || !this.hasPreviousPage()) {
      return;
    }

    this.pageNumber.update(page => Math.max(1, page - 1));
    this.loadRoles();
  }

  nextPage(): void {
    if (this.isLoadingRoles() || !this.hasNextPage()) {
      return;
    }

    this.pageNumber.update(page => page + 1);
    this.loadRoles();
  }

  changePageSize(size: number): void {
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    ) {
      return;
    }

    this.pageSize.set(size);
    this.pageNumber.set(1);
    this.loadRoles();
  }

  // =========================================================
  // Create / Edit
  // =========================================================

  openCreateRole(): void {
    if (!this.canOpenEditor()) {
      return;
    }

    this.roleForm.reset({
      code: '',
      name: '',
      description: ''
    });

    this.roleForm.controls.code.enable();
    this.selectedRole.set(null);
    this.roleFormError.set(null);
    this.formMode.set('create');
  }

  openEditRole(role: RoleDirectoryItem): void {
    if (
      !this.canOpenEditor() ||
      role.isSystemRole ||
      !role.rowVersion
    ) {
      return;
    }

    this.roleForm.reset({
      code: role.code,
      name: role.name,
      description: role.description ?? ''
    });

    this.roleForm.controls.code.disable();
    this.selectedRole.set(role);
    this.roleFormError.set(null);
    this.formMode.set('edit');
  }

  saveRole(): void {
    const companyId = this.companyId();
    const mode = this.formMode();
    const selectedRole = this.selectedRole();

    if (
      companyId === null ||
      companyId <= 0 ||
      mode === null ||
      this.isSavingRole() ||
      this.changingStatusRoleId() !== null
    ) {
      return;
    }

    const values = this.roleForm.getRawValue();

    const code = values.code.trim();
    const name = values.name.trim();
    const description = values.description.trim() || null;

    this.roleForm.patchValue({
      code,
      name,
      description: description ?? ''
    });

    this.roleForm.updateValueAndValidity();

    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    if (!code || !name) {
      this.roleFormError.set('Role code and name are required.');
      return;
    }

    if (
      mode === 'edit' &&
      (
        !selectedRole ||
        selectedRole.isSystemRole ||
        !selectedRole.rowVersion
      )
    ) {
      this.roleFormError.set(
        'Role details are outdated. Refresh the directory and try again.'
      );
      return;
    }

    this.cancelSaveRequest();

    const version = this.saveRequestVersion;

    this.isSavingRole.set(true);
    this.roleFormError.set(null);

    const request$ = mode === 'create'
      ? this.roleService.createRole(
          companyId,
          {
            code,
            name,
            description
          } satisfies CreateRoleRequest
        )
      : this.roleService.updateRole(
          companyId,
          selectedRole!.id,
          {
            name,
            description,
            rowVersion: selectedRole!.rowVersion
          } satisfies UpdateRoleRequest
        );

    this.saveSubscription = request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.saveRequestVersion) {
            this.isSavingRole.set(false);
          }
        })
      )
      .subscribe({
        next: () => {
          if (
            version !== this.saveRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.formMode.set(null);
          this.selectedRole.set(null);
          this.roleForm.reset();
          this.roleForm.controls.code.enable();

          this.notificationService.success(
            mode === 'create'
              ? 'Custom role created successfully.'
              : 'Role updated successfully.',
            {
              title: mode === 'create'
                ? 'Role Created'
                : 'Role Updated'
            }
          );

          this.loadRoles();
        },
        error: (error: HttpErrorResponse) => {
          if (
            version !== this.saveRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.roleFormError.set(
            this.getApiErrorMessage(
              error,
              'Unable to save the role. Please try again.'
            )
          );
        }
      });
  }

  closeRoleForm(): void {
    if (this.isSavingRole()) {
      return;
    }

    this.cancelSaveRequest();
    this.formMode.set(null);
    this.selectedRole.set(null);
    this.roleFormError.set(null);
    this.roleForm.reset();
    this.roleForm.controls.code.enable();
  }

  // =========================================================
  // Role Status
  // =========================================================

  activateRole(role: RoleDirectoryItem): void {
    this.requestStatusChange(role, true);
  }

  deactivateRole(role: RoleDirectoryItem): void {
    this.requestStatusChange(role, false);
  }

  private requestStatusChange(
    role: RoleDirectoryItem,
    activate: boolean
  ): void {
    const companyId = this.companyId();

    if (
      companyId === null ||
      companyId <= 0 ||
      role.isSystemRole ||
      role.isActive === activate ||
      !role.rowVersion ||
      this.isSavingRole() ||
      this.changingStatusRoleId() !== null ||
      this.isLoadingRoles()
    ) {
      return;
    }

    if (!activate && role.assignedUserCount > 0) {
      this.roleStatusError.set(
        'Revoke active user assignments before deactivating this role.'
      );
      return;
    }

    this.roleStatusError.set(null);

    this.pendingConfirmation.set({
      role,
      action: activate ? 'activate' : 'deactivate',
      companyId
    });
  }

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  confirmPendingAction(): void {
    const pending = this.pendingConfirmation();

    if (!pending) {
      return;
    }

    this.pendingConfirmation.set(null);

    if (this.companyId() !== pending.companyId) {
      return;
    }

    const activate = pending.action === 'activate';
    const role = pending.role;

    if (
      role.isSystemRole ||
      role.isActive === activate ||
      !role.rowVersion ||
      this.changingStatusRoleId() !== null ||
      this.isSavingRole() ||
      this.isLoadingRoles() ||
      (!activate && role.assignedUserCount > 0)
    ) {
      return;
    }

    this.cancelStatusRequest();

    const version = this.statusRequestVersion;
    const companyId = pending.companyId;

    this.changingStatusRoleId.set(role.id);
    this.roleStatusError.set(null);

    const request = {
      rowVersion: role.rowVersion
    };

    const request$ = activate
      ? this.roleService.activateRole(
          companyId,
          role.id,
          request
        )
      : this.roleService.deactivateRole(
          companyId,
          role.id,
          request
        );

    this.statusSubscription = request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.statusRequestVersion) {
            this.changingStatusRoleId.set(null);
          }
        })
      )
      .subscribe({
        next: () => {
          if (
            version !== this.statusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.notificationService.success(
            activate
              ? 'Role activated successfully.'
              : 'Role deactivated successfully.',
            {
              title: activate
                ? 'Role Activated'
                : 'Role Deactivated'
            }
          );

          this.loadRoles();
        },
        error: (error: HttpErrorResponse) => {
          if (
            version !== this.statusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.roleStatusError.set(
            this.getApiErrorMessage(
              error,
              'Unable to change role status.'
            )
          );
        }
      });
  }

  // =========================================================
  // Guards / Reset / Cancellation
  // =========================================================

  private canOpenEditor(): boolean {
    const companyId = this.companyId();

    return (
      companyId !== null &&
      companyId > 0 &&
      !this.isSavingRole() &&
      this.changingStatusRoleId() === null &&
      !this.isLoadingRoles()
    );
  }

  private resetForCompanyChange(): void {
    this.cancelDirectoryRequest();
    this.cancelSaveRequest();
    this.cancelStatusRequest();

    this.pendingConfirmation.set(null);
    this.formMode.set(null);
    this.selectedRole.set(null);
    this.roleFormError.set(null);
    this.roleStatusError.set(null);

    this.roleForm.reset({
      code: '',
      name: '',
      description: ''
    });

    this.roleForm.controls.code.enable();

    this.searchText.set('');
    this.selectedIsActive.set(null);
    this.selectedRoleType.set(null);
    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();
    this.directoryError.set(null);
    this.isLoadingRoles.set(false);
  }

  private clearDirectory(): void {
    this.roles.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
    this.hasPreviousPage.set(false);
    this.hasNextPage.set(false);
  }

  private cancelDirectoryRequest(): void {
    ++this.directoryRequestVersion;
    this.directorySubscription?.unsubscribe();
    this.directorySubscription = null;
  }

  private cancelSaveRequest(): void {
    ++this.saveRequestVersion;
    this.saveSubscription?.unsubscribe();
    this.saveSubscription = null;
    this.isSavingRole.set(false);
  }

  private cancelStatusRequest(): void {
    ++this.statusRequestVersion;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.changingStatusRoleId.set(null);
  }

  // =========================================================
  // API Errors
  // =========================================================

  private getApiErrorMessage(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const body: unknown = error.error;

    let message: string | null = null;

    if (
      body !== null &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      const response = body as {
        message?: unknown;
        title?: unknown;
        errors?: unknown;
      };

      if (typeof response.message === 'string') {
        message = response.message;
      }

      if (!message && response.errors) {
        const errors = response.errors;

        if (Array.isArray(errors)) {
          message = errors
            .filter(
              (item): item is string =>
                typeof item === 'string'
            )
            .join(' ');
        } else if (typeof errors === 'object') {
          message = Object.values(errors)
            .flatMap(value =>
              Array.isArray(value) ? value : [value]
            )
            .filter(
              (item): item is string =>
                typeof item === 'string'
            )
            .join(' ');
        }
      }

      if (
        !message &&
        typeof response.title === 'string'
      ) {
        message = response.title;
      }
    }

    switch (error.status) {
      case 0:
        return 'Unable to connect to the server. Check your connection.';

      case 400:
      case 422:
        return message || 'Invalid role information. Check the form values.';

      case 401:
        return 'Your session has expired. Please sign in again.';

      case 403:
        return 'You do not have permission to perform this role operation.';

      case 404:
        return message || 'The company or role could not be found.';

      case 409:
        return (
          (message || 'This role conflicts with existing data.') +
          ' Refresh the directory before retrying.'
        );

      case 429:
        return 'Too many requests. Please try again later.';

      default:
        return message || fallback;
    }
  }
}