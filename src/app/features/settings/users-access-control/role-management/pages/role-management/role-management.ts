
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  computed,
  inject,
  signal,
  untracked
} from '@angular/core';

import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { finalize, Subscription } from 'rxjs';

import {
  CreateRoleRequest,
  RoleDirectoryItem,
  RoleListQuery,
  RolePagedResult,
  UpdateRoleRequest,
  RolePermissions,
  RolePermissionItem,
  PermissionMatrixViewMode,
  calculatePermissionChanges,
  buildPermissionUpdateRequest
} from '../../models/role.model';

import { RoleService } from '../../services/role.service';

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

  private readonly roleService = inject(RoleService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  // =========================================================
  // Dialog Accessibility State
  // =========================================================

  private previousFocusedElement: HTMLElement | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private restoreFocusTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly focusableSelector =
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), ' +
    '[tabindex]:not([tabindex="-1"])';

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

  readonly selectedRoleType =
    signal<'system' | 'custom' | null>(null);

  // =========================================================
  // Create / Edit State
  // =========================================================

  readonly formMode = signal<'create' | 'edit' | null>(null);
  readonly selectedRole = signal<RoleDirectoryItem | null>(null);
  readonly isSavingRole = signal(false);
  readonly roleFormError = signal<string | null>(null);

  readonly roleForm = this.formBuilder.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.maxLength(200)
      ]
    ],
    description: [
      '',
      [Validators.maxLength(500)]
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

  private permissionSubscription: Subscription | null = null;
  private permissionSaveSubscription: Subscription | null = null;
  private permissionRequestVersion = 0;
  private permissionSaveVersion = 0;

  private statusSubscription: Subscription | null = null;
  private statusRequestVersion = 0;

  // =========================================================
  // Constructor / Lifecycle
  // =========================================================

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
      this.cancelPermissionRequests();
      this.clearDialogTimers();
      this.previousFocusedElement = null;
    });
  }

  // =========================================================
  // Role Directory
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
    if (
      this.isLoadingRoles() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(page => Math.max(1, page - 1));
    this.loadRoles();
  }

  nextPage(): void {
    if (
      this.isLoadingRoles() ||
      !this.hasNextPage()
    ) {
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
  // Create Role
  // =========================================================

  openCreateRole(): void {
    if (!this.canOpenEditor()) {
      return;
    }

    this.roleForm.reset({
      name: '',
      description: ''
    });

    this.selectedRole.set(null);
    this.roleFormError.set(null);

    this.openRoleDialog('create');
  }

  // =========================================================
  // Edit Role
  // =========================================================

  openEditRole(role: RoleDirectoryItem): void {
    if (
      !this.canOpenEditor() ||
      role.isSystemRole ||
      !role.rowVersion
    ) {
      return;
    }

    this.roleForm.reset({
      name: role.name,
      description: role.description ?? ''
    });

    this.selectedRole.set(role);
    this.roleFormError.set(null);

    this.openRoleDialog('edit');
  }

  // =========================================================
  // Save Create / Edit
  // =========================================================

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

    const name = values.name.trim();
    const description = values.description.trim() || null;

    this.roleForm.patchValue({
      name,
      description: description ?? ''
    });

    this.roleForm.updateValueAndValidity();

    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    if (!name) {
      this.roleFormError.set('Role name is required.');
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

    // Create: Role Code is generated by the backend.
    // Edit: RowVersion is required.

    const request$ = mode === 'create'
      ? this.roleService.createRole(
          companyId,
          {
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

          this.dismissRoleDialog();
          this.selectedRole.set(null);
          this.roleForm.reset();

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
    this.dismissRoleDialog();

    this.selectedRole.set(null);
    this.roleFormError.set(null);
    this.roleForm.reset();
  }

  // =========================================================
  // Create / Edit Dialog Accessibility
  // =========================================================

  private openRoleDialog(
    mode: 'create' | 'edit'
  ): void {
    this.clearDialogTimers();

    this.captureFocusedElement();
    this.formMode.set(mode);

    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;

      if (this.formMode() !== mode) {
        return;
      }

      const dialog = this.getRoleDialog();

      const field = dialog?.querySelector<HTMLInputElement>(
        '#roleName'
      );

      if (field && !field.disabled) {
        field.focus();
      } else {
        dialog?.focus();
      }
    }, 0);
  }

  private dismissRoleDialog(): void {
    this.formMode.set(null);
    this.restorePreviousFocus();
  }

  // =========================================================
  // Activate / Deactivate
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
      this.formMode() !== null ||
      this.pendingConfirmation() !== null ||
      role.isSystemRole ||
      role.isActive === activate ||
      !role.rowVersion ||
      this.isSavingRole() ||
      this.changingStatusRoleId() !== null ||
      this.isLoadingRoles()
    ) {
      return;
    }

    if (
      !activate &&
      role.assignedUserCount > 0
    ) {
      this.roleStatusError.set(
        'Revoke active user assignments before deactivating this role.'
      );
      return;
    }

    this.roleStatusError.set(null);

    // Preserve the button that opened the confirmation.
    this.clearDialogTimers();
    this.captureFocusedElement();

    this.pendingConfirmation.set({
      role,
      action: activate ? 'activate' : 'deactivate',
      companyId
    });

    // The modal is rendered outside the inert page container.
    // Focus it after Angular renders the new view.
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;

      const pending = this.pendingConfirmation();

      if (
        !pending ||
        pending.companyId !== companyId ||
        pending.role.id !== role.id
      ) {
        return;
      }

      const dialog = this.getConfirmationDialog();

      const cancelButton =
        dialog?.querySelector<HTMLButtonElement>(
          '.role-confirmation-actions .button-secondary'
        );

      if (cancelButton && !cancelButton.disabled) {
        cancelButton.focus();
      } else {
        dialog?.focus();
      }
    }, 0);
  }

  cancelConfirmation(): void {
    if (!this.pendingConfirmation()) {
      return;
    }

    this.pendingConfirmation.set(null);
    this.restorePreviousFocus();
  }

  confirmPendingAction(): void {
    const pending = this.pendingConfirmation();

    if (!pending) {
      return;
    }

    this.pendingConfirmation.set(null);
    this.restorePreviousFocus();

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
  // Shared Dialog Keyboard Accessibility
  // =========================================================

  @HostListener('document:keydown', ['$event'])
  onDialogKeydown(event: KeyboardEvent): void {
    const confirmationOpen =
      this.pendingConfirmation() !== null;

    const editorOpen =
      this.formMode() !== null;

    const permissionOpen = this.permissionRole() !== null;

    if (!confirmationOpen && !editorOpen && !permissionOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();

      if (permissionOpen) {
        this.closePermissions();
      } else if (confirmationOpen) {
        this.cancelConfirmation();
      } else if (!this.isSavingRole()) {
        this.closeRoleForm();
      }

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = permissionOpen
      ? this.host.nativeElement.querySelector<HTMLElement>('.permission-dialog')
      : confirmationOpen
        ? this.getConfirmationDialog()
        : this.getRoleDialog();

    if (!dialog) {
      return;
    }

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        this.focusableSelector
      )
    ).filter(
      element => element.getClientRects().length > 0
    );

    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;

    if (!active || !dialog.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
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
  // Dialog Focus Helpers
  // =========================================================

  private getRoleDialog(): HTMLElement | null {
    return this.host.nativeElement
      .querySelector<HTMLElement>('.role-dialog');
  }

  private getConfirmationDialog(): HTMLElement | null {
    return this.host.nativeElement
      .querySelector<HTMLElement>(
        '.role-confirmation-dialog'
      );
  }

  private captureFocusedElement(): void {
    const active = this.document.activeElement;

    this.previousFocusedElement =
      active instanceof HTMLElement ? active : null;
  }

  private restorePreviousFocus(): void {
    this.clearDialogTimers();

    const previous = this.previousFocusedElement;
    this.previousFocusedElement = null;

    if (!previous) {
      return;
    }

    this.restoreFocusTimer = setTimeout(() => {
      this.restoreFocusTimer = null;

      if (
        previous.isConnected &&
        this.formMode() === null &&
        this.pendingConfirmation() === null &&
        this.permissionRole() === null
      ) {
        previous.focus();
      }
    }, 0);
  }

  private clearDialogTimers(): void {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }

    if (this.restoreFocusTimer !== null) {
      clearTimeout(this.restoreFocusTimer);
      this.restoreFocusTimer = null;
    }
  }

  // =========================================================
  // Guards / Reset
  // =========================================================

  private canOpenEditor(): boolean {
    const companyId = this.companyId();

    return (
      companyId !== null &&
      companyId > 0 &&
      this.formMode() === null &&
      this.pendingConfirmation() === null &&
      this.permissionRole() === null &&
      !this.isSavingRole() &&
      this.changingStatusRoleId() === null &&
      !this.isLoadingRoles()
    );
  }

  private resetForCompanyChange(): void {
    this.cancelDirectoryRequest();
    this.cancelSaveRequest();
    this.cancelStatusRequest();
    this.cancelPermissionRequests();
    this.permissionRole.set(null);
    this.permissionData.set(null);
    this.permissionDraft.set([]);

    this.pendingConfirmation.set(null);
    this.clearDialogTimers();
    this.previousFocusedElement = null;

    this.formMode.set(null);
    this.selectedRole.set(null);
    this.roleFormError.set(null);
    this.roleStatusError.set(null);

    this.roleForm.reset({
      name: '',
      description: ''
    });

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
  // API Error Handling
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
        return message ||
          'Invalid role information. Check the form values.';

      case 401:
        return 'Your session has expired. Please sign in again.';

      case 403:
        return 'You do not have permission to perform this role operation.';

      case 404:
        return message ||
          'The company or role could not be found.';

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

  // =========================================================
  // Hybrid Permission Matrix — company-isolated draft editor
  // =========================================================
  readonly permissionRole = signal<RoleDirectoryItem | null>(null);
  readonly permissionData = signal<RolePermissions | null>(null);
  readonly permissionDraft = signal<string[]>([]);
  readonly permissionLoading = signal(false);
  readonly permissionSaving = signal(false);
  readonly permissionError = signal<string | null>(null);
  readonly permissionConflict = signal(false);
  readonly permissionSearch = signal('');
  readonly permissionFilter = signal<PermissionMatrixViewMode>('all');
  readonly permissionModule = signal<string | null>(null);
  readonly expandedModules = signal<string[]>([]);

  readonly permissionChanges = computed(() =>
    calculatePermissionChanges(
      (this.permissionData()?.permissions ?? []).filter(p => p.isAssigned).map(p => p.code),
      this.permissionDraft()
    )
  );

  readonly permissionModules = computed(() => {
    const permissions = this.permissionData()?.permissions ?? [];
    const selected = new Set(this.permissionDraft());
    const modules = new Map<string, RolePermissionItem[]>();
    for (const permission of permissions) {
      const key = permission.module || 'General';
      modules.set(key, [...(modules.get(key) ?? []), permission]);
    }
    return [...modules.entries()].map(([name, items]) => ({
      name,
      count: items.length,
      assigned: items.filter(item => selected.has(item.code)).length
    })).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly visiblePermissions = computed(() => {
    const data = this.permissionData();
    if (!data) return [] as RolePermissionItem[];
    const module = this.permissionModule();
    const query = this.permissionSearch().trim().toLocaleLowerCase();
    const selected = new Set(this.permissionDraft());
    const filter = this.permissionFilter();
    return data.permissions.filter(item => {
      if (module && item.module !== module) return false;
      if (query && !`${item.name} ${item.code} ${item.description} ${item.module}`.toLocaleLowerCase().includes(query)) return false;
      const assigned = selected.has(item.code);
      if (filter === 'assigned' && !assigned) return false;
      if (filter === 'unassigned' && assigned) return false;
      if (filter === 'changed' && assigned === item.isAssigned) return false;
      return true;
    });
  });

  readonly canEditPermissions = computed(() => {
    const data = this.permissionData();
    return !!data && !data.isSystemRole && data.isActive && !this.permissionSaving() && !this.permissionConflict();
  });

  openPermissions(role: RoleDirectoryItem): void {
    const companyId = this.companyId();
    if (companyId === null || companyId <= 0 || this.formMode() !== null ||
        this.pendingConfirmation() !== null || this.permissionRole() !== null ||
        this.isLoadingRoles() || this.isSavingRole() || this.changingStatusRoleId() !== null) return;
    this.captureFocusedElement();
    this.permissionRole.set(role);
    this.permissionSearch.set('');
    this.permissionFilter.set('all');
    this.permissionModule.set(null);
    this.loadPermissions();
    this.clearDialogTimers();
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      this.host.nativeElement.querySelector<HTMLElement>('.permission-dialog')?.focus();
    }, 0);
  }

  loadPermissions(): void {
    const companyId = this.companyId();
    const role = this.permissionRole();
    this.cancelPermissionLoad();
    const version = this.permissionRequestVersion;
    if (!role || companyId === null || companyId <= 0) return;
    this.permissionLoading.set(true);
    this.permissionError.set(null);
    this.permissionConflict.set(false);
    this.permissionData.set(null);
    this.permissionDraft.set([]);
    this.permissionSubscription = this.roleService.getRolePermissions(companyId, role.id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
        if (version === this.permissionRequestVersion) this.permissionLoading.set(false);
      }))
      .subscribe({
        next: data => {
          if (version !== this.permissionRequestVersion || this.companyId() !== companyId || this.permissionRole()?.id !== role.id) return;
          this.permissionData.set(data);
          this.permissionDraft.set(data.permissions.filter(item => item.isAssigned).map(item => item.code));
          const names = [...new Set(data.permissions.map(item => item.module || 'General'))].sort();
          this.expandedModules.set(names);
          this.permissionModule.set(null);
        },
        error: (error: HttpErrorResponse) => {
          if (version !== this.permissionRequestVersion || this.companyId() !== companyId) return;
          this.permissionError.set(this.getApiErrorMessage(error, 'Unable to load permissions.'));
        }
      });
  }

  selectPermissionModule(module: string | null): void {
    this.permissionModule.set(module);
  }

  toggleModuleExpanded(module: string): void {
    this.expandedModules.update(items => items.includes(module)
      ? items.filter(item => item !== module) : [...items, module]);
  }

  isPermissionSelected(code: string): boolean {
    return this.permissionDraft().includes(code);
  }

  togglePermission(code: string, checked: boolean): void {
    if (!this.canEditPermissions() || !this.permissionData()?.permissions.some(item => item.code === code)) return;
    this.permissionDraft.update(items => checked
      ? [...new Set([...items, code])] : items.filter(item => item !== code));
  }

  selectAllPermissions(checked: boolean, module: string | null = null): void {
    if (!this.canEditPermissions()) return;
    const codes = (this.permissionData()?.permissions ?? [])
      .filter(item => module === null || item.module === module).map(item => item.code);
    const affected = new Set(codes);
    this.permissionDraft.update(items => checked
      ? [...new Set([...items, ...codes])]
      : items.filter(code => !affected.has(code)));
  }

  resetPermissionDraft(): void {
    if (!this.canEditPermissions()) return;
    this.permissionDraft.set((this.permissionData()?.permissions ?? [])
      .filter(item => item.isAssigned).map(item => item.code));
  }

  savePermissions(): void {
    const companyId = this.companyId();
    const role = this.permissionRole();
    const data = this.permissionData();
    if (companyId === null || companyId <= 0 || !role || !data ||
        !this.canEditPermissions() || !this.permissionChanges().hasChanges || !data.rowVersion) return;
    this.permissionSaveSubscription?.unsubscribe();
    const version = ++this.permissionSaveVersion;
    this.permissionSaving.set(true);
    this.permissionError.set(null);
    const request = buildPermissionUpdateRequest(this.permissionDraft(), data.rowVersion);
    this.permissionSaveSubscription = this.roleService.updateRolePermissions(companyId, role.id, request)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
        if (version === this.permissionSaveVersion) this.permissionSaving.set(false);
      }))
      .subscribe({
        next: () => {
          if (version !== this.permissionSaveVersion || this.companyId() !== companyId || this.permissionRole()?.id !== role.id) return;
          this.notificationService.success('Role permissions updated successfully.', { title: 'Permissions Saved' });
          this.loadRoles();
          this.loadPermissions();
        },
        error: (error: HttpErrorResponse) => {
          if (version !== this.permissionSaveVersion || this.companyId() !== companyId) return;
          if (error.status === 409) this.permissionConflict.set(true);
          this.permissionError.set(this.getApiErrorMessage(error, 'Unable to save permissions.'));
        }
      });
  }

  closePermissions(): void {
    if (this.permissionSaving()) return;
    if (this.permissionChanges().hasChanges && !this.permissionConflict() &&
        !this.document.defaultView?.confirm('Discard unsaved permission changes?')) return;
    this.cancelPermissionRequests();
    this.permissionRole.set(null);
    this.permissionData.set(null);
    this.permissionDraft.set([]);
    this.permissionError.set(null);
    this.permissionConflict.set(false);
    this.restorePreviousFocus();
  }

  private cancelPermissionLoad(): void {
    ++this.permissionRequestVersion;
    this.permissionSubscription?.unsubscribe();
    this.permissionSubscription = null;
    this.permissionLoading.set(false);
  }

  private cancelPermissionRequests(): void {
    this.cancelPermissionLoad();
    ++this.permissionSaveVersion;
    this.permissionSaveSubscription?.unsubscribe();
    this.permissionSaveSubscription = null;
    this.permissionSaving.set(false);
  }

}