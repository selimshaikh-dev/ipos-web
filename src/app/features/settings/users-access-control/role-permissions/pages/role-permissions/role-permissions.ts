
import { HttpErrorResponse } from '@angular/common/http';

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import {
  finalize,
  Subscription
} from 'rxjs';

import {
  RoleDirectoryItem,
  RolePermissions as RolePermissionsData,
  UpdateRolePermissionsRequest
} from '../../../role-management/models/role.model';

import {
  RoleService
} from '../../../role-management/services/role.service';

import {
  PermissionModuleScope,
  PermissionModuleView,
  PermissionRowView,
  PermissionSummaryView,
  PermissionDraftChangesView,
  PermissionViewFilter,
  PermissionToggleEvent,
  PermissionBulkActionEvent
} from '../../models/permission-view.model';

import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';

import {
  PermissionSummary
} from '../components/permission-summary/permission-summary';

import {
  PermissionExplorer
} from '../components/permission-explorer/permission-explorer';

import {
  PermissionMatrix
} from '../components/permission-matrix/permission-matrix';

/**
 * ============================================================
 * iPOS Enterprise — Role Permissions
 * ============================================================
 *
 * Angular Standalone Component
 *
 * Responsibilities:
 * - Company-scoped permission management
 * - Permission catalog loading
 * - Permission draft management
 * - Module explorer state
 * - Permission search and filtering
 * - Individual grant/revoke
 * - Module-scoped bulk operations
 * - Unsaved changes detection
 * - Optimistic concurrency protection
 * - Permission saving
 * - Read-only system/inactive roles
 *
 * API contracts and RoleService are reused from
 * the existing Role Management feature.
 * ============================================================
 */

@Component({
  selector: 'app-role-permissions',
  standalone: true,
  imports: [PermissionSummary, PermissionExplorer, PermissionMatrix],
  templateUrl: './role-permissions.html',
  styleUrl: './role-permissions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolePermissions {

  // ==========================================================
  // Dependencies
  // ==========================================================

  private readonly roleService = inject(RoleService);

  private readonly workspaceContext =
    inject(WorkspaceContextService);

  private readonly notificationService =
    inject(NotificationService);

  private readonly destroyRef = inject(DestroyRef);

  // ==========================================================
  // Parent Component Contract
  // ==========================================================

  readonly role = input.required<RoleDirectoryItem>();

  readonly closeRequested = output<void>();

  readonly permissionsSaved = output<void>();

  // ==========================================================
  // Workspace Context
  // ==========================================================

  private readonly companyId =
    this.workspaceContext.companyId;

  // ==========================================================
  // Request Lifecycle
  // ==========================================================

  private loadSubscription: Subscription | null = null;

  private saveSubscription: Subscription | null = null;

  private loadRequestVersion = 0;

  private saveRequestVersion = 0;

  // ==========================================================
  // API State
  // ==========================================================

  readonly permissionData =
    signal<RolePermissionsData | null>(null);

  readonly isLoading = signal(false);

  readonly isSaving = signal(false);

  readonly loadError = signal<string | null>(null);

  readonly saveError = signal<string | null>(null);

  readonly hasConflict = signal(false);

  // ==========================================================
  // Permission Draft
  // ==========================================================

  readonly permissionDraft =
    signal<readonly string[]>([]);

  // ==========================================================
  // Explorer / Matrix State
  // ==========================================================

  readonly selectedModule =
    signal<PermissionModuleScope>(null);

  readonly searchText = signal('');

  readonly activeFilter =
    signal<PermissionViewFilter>('all');

  readonly pendingBulkAction =
    signal<PermissionBulkActionEvent | null>(null);

  // ==========================================================
  // Role Identity
  // ==========================================================

  readonly roleName = computed(() =>
    this.permissionData()?.roleName ??
    this.role().name
  );

  readonly roleCode = computed(() =>
    this.permissionData()?.roleCode ??
    this.role().code
  );

  readonly isSystemRole = computed(() =>
    this.permissionData()?.isSystemRole ??
    this.role().isSystemRole
  );

  readonly isActiveRole = computed(() =>
    this.permissionData()?.isActive ??
    this.role().isActive
  );

  readonly isReadOnly = computed(() =>
    this.isSystemRole() || !this.isActiveRole()
  );

  readonly readOnlyReason = computed(() => {
    if (this.isSystemRole()) {
      return 'System role permissions are read-only.';
    }

    if (!this.isActiveRole()) {
      return 'Inactive role permissions cannot be modified.';
    }

    return null;
  });

  // ==========================================================
  // Permission Catalog
  // ==========================================================

  readonly permissionCatalog = computed(() =>
    this.permissionData()?.permissions ?? []
  );

  readonly originalAssignedCodes = computed(() =>
    new Set<string>(
      this.permissionCatalog()
        .filter(item => item.isAssigned)
        .map(item => item.code)
    )
  );

  readonly draftCodeSet = computed(() =>
    new Set<string>(this.permissionDraft())
  );

  readonly availableCodeSet = computed(() =>
    new Set<string>(
      this.permissionCatalog().map(item => item.code)
    )
  );

  // ==========================================================
  // Permission Summary
  // ==========================================================

  readonly permissionSummary =
    computed<PermissionSummaryView>(() => {
      const permissions = this.permissionCatalog();
      const selectedCodes = this.draftCodeSet();

      const modules = new Set<string>(
        permissions.map(item => item.module || 'General')
      );

      return {
        totalModules: modules.size,
        totalPermissions: permissions.length,
        grantedPermissions: permissions.filter(item =>
          selectedCodes.has(item.code)
        ).length
      };
    });

  // ==========================================================
  // Module Explorer
  // ==========================================================

  readonly permissionModules =
    computed<readonly PermissionModuleView[]>(() => {
      const groups = new Map<
        string,
        { count: number; assigned: number }
      >();

      const selectedCodes = this.draftCodeSet();

      for (const permission of this.permissionCatalog()) {
        const moduleName = permission.module || 'General';

        const current = groups.get(moduleName) ?? {
          count: 0,
          assigned: 0
        };

        current.count++;

        if (selectedCodes.has(permission.code)) {
          current.assigned++;
        }

        groups.set(moduleName, current);
      }

      return [...groups.entries()]
        .map(([name, values]) => ({
          name,
          count: values.count,
          assigned: values.assigned
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

  // ==========================================================
  // Permission Rows
  // ==========================================================

  readonly permissionRows =
    computed<readonly PermissionRowView[]>(() => {
      const originalCodes = this.originalAssignedCodes();
      const selectedCodes = this.draftCodeSet();

      return this.permissionCatalog().map(permission => {
        const originallyAssigned =
          originalCodes.has(permission.code);

        const isAllowed =
          selectedCodes.has(permission.code);

        const changeType: PermissionRowView['changeType'] =
          originallyAssigned === isAllowed
            ? 'unchanged'
            : isAllowed
              ? 'added'
              : 'removed';

        return {
          code: permission.code,
          name: permission.name,
          module: permission.module || 'General',
          description: permission.description ?? null,
          originallyAssigned,
          isAllowed,
          changeType
        };
      });
    });

  // ==========================================================
  // Search and Filtering
  // ==========================================================

  readonly visiblePermissions =
    computed<readonly PermissionRowView[]>(() => {
      const module = this.selectedModule();
      const filter = this.activeFilter();
      const search = this.searchText().trim().toLowerCase();

      return this.permissionRows()
        .filter(permission =>
          module === null ||
          permission.module === module
        )
        .filter(permission => {
          switch (filter) {
            case 'assigned':
              return permission.isAllowed;

            case 'unassigned':
              return !permission.isAllowed;

            case 'changed':
              return permission.changeType !== 'unchanged';

            default:
              return true;
          }
        })
        .filter(permission => {
          if (!search) {
            return true;
          }

          return (
            permission.name.toLowerCase().includes(search) ||
            permission.module.toLowerCase().includes(search) ||
            (permission.description ?? '')
              .toLowerCase()
              .includes(search)
          );
        });
    });

  readonly visiblePermissionCount = computed(() =>
    this.visiblePermissions().length
  );

  // ==========================================================
  // Unsaved Changes
  // ==========================================================

  readonly permissionChanges =
    computed<PermissionDraftChangesView>(() => {
      const originalCodes = this.originalAssignedCodes();
      const selectedCodes = this.draftCodeSet();

      let added = 0;
      let removed = 0;

      for (const permission of this.permissionCatalog()) {
        const wasAllowed = originalCodes.has(permission.code);
        const isAllowed = selectedCodes.has(permission.code);

        if (!wasAllowed && isAllowed) {
          added++;
        }

        if (wasAllowed && !isAllowed) {
          removed++;
        }
      }

      const total = added + removed;

      return {
        added,
        removed,
        total,
        hasChanges: total > 0
      };
    });

  readonly hasUnsavedChanges = computed(() =>
    this.permissionChanges().hasChanges
  );

  // ==========================================================
  // Edit / Save Guards
  // ==========================================================

  readonly canEditPermissions = computed(() =>
    this.permissionData() !== null &&
    !this.isReadOnly() &&
    !this.isLoading() &&
    !this.isSaving() &&
    !this.hasConflict() &&
    this.pendingBulkAction() === null
  );

  readonly canSavePermissions = computed(() =>
    this.canEditPermissions() &&
    this.hasUnsavedChanges() &&
    !!this.permissionData()?.rowVersion
  );

  // ==========================================================
  // Context Synchronization
  // ==========================================================

  constructor() {
    effect(() => {
      const companyId = this.companyId();
      const roleId = this.role().id;

      untracked(() => {
        this.resetEditor();
        this.loadPermissions(companyId, roleId);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelLoadRequest();
      this.cancelSaveRequest();
    });
  }

  // ==========================================================
  // Load Permissions
  // ==========================================================

  loadPermissions(
    companyId: number | null = this.companyId(),
    roleId: number = this.role().id
  ): void {
    this.cancelLoadRequest();

    this.permissionData.set(null);
    this.permissionDraft.set([]);

    this.loadError.set(null);
    this.saveError.set(null);
    this.hasConflict.set(false);

    if (
      companyId === null ||
      companyId <= 0 ||
      roleId <= 0
    ) {
      this.isLoading.set(false);
      this.loadError.set(
        'Select a valid company and role to load permissions.'
      );
      return;
    }

    const requestVersion = this.loadRequestVersion;

    this.isLoading.set(true);

    this.loadSubscription = this.roleService
      .getRolePermissions(companyId, roleId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.loadRequestVersion) {
            this.isLoading.set(false);
          }
        })
      )
      .subscribe({
        next: data => {
          if (
            requestVersion !== this.loadRequestVersion ||
            this.companyId() !== companyId ||
            this.role().id !== roleId
          ) {
            return;
          }

          this.permissionData.set(data);

          this.permissionDraft.set(
            data.permissions
              .filter(item => item.isAssigned)
              .map(item => item.code)
          );

          this.selectedModule.set(null);
        },

        error: (error: HttpErrorResponse) => {
          if (
            requestVersion !== this.loadRequestVersion ||
            this.companyId() !== companyId ||
            this.role().id !== roleId
          ) {
            return;
          }

          this.loadError.set(
            this.getApiErrorMessage(
              error,
              'Unable to load role permissions.'
            )
          );
        }
      });
  }

  // ==========================================================
  // Reload
  // ==========================================================

  reloadPermissions(): void {
    if (this.isSaving() || this.isLoading()) {
      return;
    }

    if (
      this.hasUnsavedChanges() &&
      !window.confirm(
        'Reload permissions and discard all unsaved changes?'
      )
    ) {
      return;
    }

    this.resetFilters();
    this.loadPermissions();
  }

  // ==========================================================
  // Module Selection
  // ==========================================================

  selectModule(module: PermissionModuleScope): void {
    if (this.isLoading()) {
      return;
    }

    if (
      module !== null &&
      !this.permissionModules().some(item => item.name === module)
    ) {
      return;
    }

    this.selectedModule.set(module);
  }

  // ==========================================================
  // Search / Filter
  // ==========================================================

  setSearchText(value: string): void {
    this.searchText.set(value);
  }

  clearSearch(): void {
    this.searchText.set('');
  }

  setPermissionFilter(filter: PermissionViewFilter): void {
    this.activeFilter.set(filter);
  }

  resetFilters(): void {
    this.searchText.set('');
    this.activeFilter.set('all');
    this.selectedModule.set(null);
  }

  // ==========================================================
  // Individual Permission Toggle
  // ==========================================================

  togglePermission(event: PermissionToggleEvent): void {
    if (!this.canEditPermissions()) {
      return;
    }

    if (!this.availableCodeSet().has(event.code)) {
      return;
    }

    this.permissionDraft.update(current => {
      const codes = new Set<string>(current);

      if (event.allowed) {
        codes.add(event.code);
      } else {
        codes.delete(event.code);
      }

      return [...codes];
    });

    this.saveError.set(null);
  }

  // ==========================================================
  // Bulk Grant / Revoke
  // ==========================================================

  requestBulkAction(event: PermissionBulkActionEvent): void {
    if (!this.canEditPermissions()) {
      return;
    }

    if (
      event.module !== null &&
      !this.permissionModules().some(
        item => item.name === event.module
      )
    ) {
      return;
    }

    if (event.module === null) {
      this.pendingBulkAction.set(event);
      return;
    }

    this.applyBulkAction(event);
  }

  confirmBulkAction(): void {
    const action = this.pendingBulkAction();

    if (!action) {
      return;
    }

    this.pendingBulkAction.set(null);

    if (!this.canEditPermissions()) {
      return;
    }

    this.applyBulkAction(action);
  }

  cancelBulkAction(): void {
    this.pendingBulkAction.set(null);
  }

  private applyBulkAction(
    event: PermissionBulkActionEvent
  ): void {
    if (!this.canEditPermissions()) {
      return;
    }

    const affectedCodes = new Set<string>(
      this.permissionCatalog()
        .filter(item =>
          event.module === null ||
          (item.module || 'General') === event.module
        )
        .map(item => item.code)
    );

    this.permissionDraft.update(current => {
      const codes = new Set<string>(current);

      for (const code of affectedCodes) {
        if (event.allowed) {
          codes.add(code);
        } else {
          codes.delete(code);
        }
      }

      return [...codes];
    });

    this.saveError.set(null);
  }

  // ==========================================================
  // Discard Draft
  // ==========================================================

  resetPermissionDraft(): void {
    if (!this.canEditPermissions()) {
      return;
    }

    if (
      this.hasUnsavedChanges() &&
      !window.confirm(
        'Discard all unsaved permission changes?'
      )
    ) {
      return;
    }

    this.permissionDraft.set(
      [...this.originalAssignedCodes()]
    );

    this.saveError.set(null);
  }

  // ==========================================================
  // Save Permissions
  // ==========================================================

  savePermissions(): void {
    if (!this.canSavePermissions()) {
      return;
    }

    const companyId = this.companyId();
    const data = this.permissionData();
    const roleId = this.role().id;

    if (
      companyId === null ||
      companyId <= 0 ||
      !data ||
      !data.rowVersion
    ) {
      return;
    }

    const selectedCodes = this.draftCodeSet();

    const permissionCodes: string[] = data.permissions
      .filter(item => selectedCodes.has(item.code))
      .map(item => item.code);

    const request: UpdateRolePermissionsRequest = {
      permissionCodes,
      rowVersion: data.rowVersion
    };

    this.cancelSaveRequest();

    const requestVersion = this.saveRequestVersion;

    this.isSaving.set(true);
    this.saveError.set(null);

    this.saveSubscription = this.roleService
      .updateRolePermissions(companyId, roleId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.saveRequestVersion) {
            this.isSaving.set(false);
          }
        })
      )
      .subscribe({
        next: response => {
          if (
            requestVersion !== this.saveRequestVersion ||
            this.companyId() !== companyId ||
            this.role().id !== roleId
          ) {
            return;
          }

          const savedCodes = new Set<string>(
            response.permissionCodes
          );

          this.permissionData.set({
            ...data,
            rowVersion: response.rowVersion,
            permissions: data.permissions.map(item => ({
              ...item,
              isAssigned: savedCodes.has(item.code)
            }))
          });

          this.permissionDraft.set(
            Array.from(savedCodes)
          );

          this.hasConflict.set(false);
          this.saveError.set(null);

          this.notificationService.success(
            'Role permissions updated successfully.',
            { title: 'Permissions Saved' }
          );

          this.permissionsSaved.emit();

          this.loadPermissions(companyId, roleId);
        },

        error: (error: HttpErrorResponse) => {
          if (
            requestVersion !== this.saveRequestVersion ||
            this.companyId() !== companyId ||
            this.role().id !== roleId
          ) {
            return;
          }

          if (error.status === 409) {
            this.hasConflict.set(true);
          }

          this.saveError.set(
            this.getApiErrorMessage(
              error,
              'Unable to save role permissions.'
            )
          );
        }
      });
  }

  // ==========================================================
  // Close Editor
  // ==========================================================

  requestClose(): void {
    if (this.isSaving()) {
      return;
    }

    if (
      this.hasUnsavedChanges() &&
      !window.confirm(
        'You have unsaved permission changes. Discard them and close?'
      )
    ) {
      return;
    }

    this.closeRequested.emit();
  }

  // ==========================================================
  // Reset
  // ==========================================================

  private resetEditor(): void {
    this.cancelLoadRequest();
    this.cancelSaveRequest();

    this.permissionData.set(null);
    this.permissionDraft.set([]);

    this.isLoading.set(false);
    this.isSaving.set(false);

    this.loadError.set(null);
    this.saveError.set(null);

    this.hasConflict.set(false);
    this.pendingBulkAction.set(null);

    this.resetFilters();
  }

  // ==========================================================
  // Request Cancellation
  // ==========================================================

  private cancelLoadRequest(): void {
    ++this.loadRequestVersion;

    this.loadSubscription?.unsubscribe();
    this.loadSubscription = null;
  }

  private cancelSaveRequest(): void {
    ++this.saveRequestVersion;

    this.saveSubscription?.unsubscribe();
    this.saveSubscription = null;
  }

  // ==========================================================
  // API Error Handling
  // ==========================================================

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
        } else if (
          errors !== null &&
          typeof errors === 'object'
        ) {
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
          'Invalid permission information.';

      case 401:
        return 'Your session has expired. Please sign in again.';

      case 403:
        return 'You do not have permission to perform this operation.';

      case 404:
        return message ||
          'The selected company or role could not be found.';

      case 409:
        return (
          (message ||
            'The role permissions were modified by another operation.') +
          ' Reload permissions before saving again.'
        );

      case 429:
        return 'Too many requests. Please try again later.';

      default:
        return message || fallback;
    }
  }
}