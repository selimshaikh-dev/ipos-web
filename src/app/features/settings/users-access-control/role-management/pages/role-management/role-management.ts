
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
  finalize,
  Subscription
} from 'rxjs';

import {
  RoleDirectoryItem,
  RoleListQuery,
  RolePagedResult
} from '../../models/role.model';

import {
  RoleService
} from '../../services/role.service';

import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';

// =========================================================
// Role Management Component
// =========================================================

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [],
  templateUrl: './role-management.html',
  styleUrl: './role-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleManagement {

  // =======================================================
  // Dependencies
  // =======================================================

  private readonly roleService = inject(RoleService);

  private readonly workspaceContext = inject(
    WorkspaceContextService
  );

  private readonly destroyRef = inject(DestroyRef);

  // =======================================================
  // Workspace Context
  // =======================================================

  readonly companyId = this.workspaceContext.companyId;

  readonly companyName =
    this.workspaceContext.companyDisplayName;

  // =======================================================
  // Roles Directory State
  // =======================================================

  readonly roles = signal<RoleDirectoryItem[]>([]);

  readonly isLoadingRoles = signal(false);

  readonly directoryError = signal<string | null>(null);

  // =======================================================
  // Pagination State
  // =======================================================

  readonly totalCount = signal(0);

  readonly totalPages = signal(0);

  readonly pageNumber = signal(1);

  readonly pageSize = signal(20);

  readonly hasPreviousPage = signal(false);

  readonly hasNextPage = signal(false);

  // =======================================================
  // Filter State
  // =======================================================

  readonly searchText = signal('');

  readonly selectedIsActive = signal<boolean | null>(null);

  readonly selectedRoleType = signal<
    'system' | 'custom' | null
  >(null);

  // =======================================================
  // Request Lifecycle
  // =======================================================

  private directorySubscription: Subscription | null = null;

  private directoryRequestVersion = 0;

  // =======================================================
  // Constructor
  // =======================================================

  constructor() {

    // Reload the directory whenever the selected
    // workspace company changes.

    effect(() => {

      const companyId = this.companyId();

      untracked(() => {

        this.resetDirectoryForCompanyChange();

        if (
          companyId !== null &&
          companyId > 0
        ) {
          this.loadRoles();
        }

      });

    });

    // Cancel outstanding requests when the
    // component is destroyed.

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
    });

  }

  // =======================================================
  // Load Roles
  // =======================================================

  loadRoles(): void {

    const companyId = this.companyId();

    this.cancelDirectoryRequest();

    const requestVersion =
      ++this.directoryRequestVersion;

    if (
      companyId === null ||
      companyId <= 0
    ) {

      this.clearDirectory();

      this.isLoadingRoles.set(false);

      this.directoryError.set(null);

      return;
    }

    const query: RoleListQuery = {

      search:
        this.searchText().trim() || undefined,

      isActive:
        this.selectedIsActive() ?? undefined,

      roleType:
        this.selectedRoleType() ?? undefined,

      pageNumber:
        this.pageNumber(),

      pageSize:
        this.pageSize()

    };

    this.isLoadingRoles.set(true);

    this.directoryError.set(null);

    this.directorySubscription = this.roleService
      .getRoles(companyId, query)
      .pipe(

        takeUntilDestroyed(this.destroyRef),

        finalize(() => {

          if (
            requestVersion ===
            this.directoryRequestVersion
          ) {

            this.isLoadingRoles.set(false);

          }

        })

      )
      .subscribe({

        next: (result: RolePagedResult) => {

          // Ignore stale responses from an earlier
          // request or a different company.

          if (
            requestVersion !==
              this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.roles.set(result.items);

          this.totalCount.set(
            result.totalCount
          );

          this.totalPages.set(
            result.totalPages
          );

          this.pageNumber.set(
            result.pageNumber
          );

          this.pageSize.set(
            result.pageSize
          );

          this.hasPreviousPage.set(
            result.hasPreviousPage
          );

          this.hasNextPage.set(
            result.hasNextPage
          );

        },

        error: (error: HttpErrorResponse) => {

          // Ignore errors from stale requests.

          if (
            requestVersion !==
              this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.clearDirectory();

          this.directoryError.set(
            this.getDirectoryErrorMessage(error)
          );

        }

      });

  }

  // =======================================================
  // Refresh Directory
  // =======================================================

  refreshDirectory(): void {

    this.loadRoles();

  }

  // =======================================================
  // Search Roles
  // =======================================================

  searchRoles(search: string): void {

    this.searchText.set(
      search.trim()
    );

    this.pageNumber.set(1);

    this.loadRoles();

  }

  // =======================================================
  // Filter by Status
  // =======================================================

  filterByStatus(
    isActive: boolean | null
  ): void {

    this.selectedIsActive.set(
      isActive
    );

    this.pageNumber.set(1);

    this.loadRoles();

  }

  // =======================================================
  // Filter by Role Type
  // =======================================================

  filterByRoleType(
    roleType: 'system' | 'custom' | null
  ): void {

    this.selectedRoleType.set(
      roleType
    );

    this.pageNumber.set(1);

    this.loadRoles();

  }

  // =======================================================
  // Reset Filters
  // =======================================================

  clearFilters(): void {

    this.searchText.set('');

    this.selectedIsActive.set(null);

    this.selectedRoleType.set(null);

    this.pageNumber.set(1);

    this.loadRoles();

  }

  // =======================================================
  // Previous Page
  // =======================================================

  previousPage(): void {

    if (
      this.isLoadingRoles() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(
      page => Math.max(1, page - 1)
    );

    this.loadRoles();

  }

  // =======================================================
  // Next Page
  // =======================================================

  nextPage(): void {

    if (
      this.isLoadingRoles() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(
      page => page + 1
    );

    this.loadRoles();

  }

  // =======================================================
  // Change Page Size
  // =======================================================

  changePageSize(
    size: number
  ): void {

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

  // =======================================================
  // Reset Directory on Company Change
  // =======================================================

  private resetDirectoryForCompanyChange(): void {

    this.cancelDirectoryRequest();

    this.searchText.set('');

    this.selectedIsActive.set(null);

    this.selectedRoleType.set(null);

    this.pageNumber.set(1);

    this.pageSize.set(20);

    this.clearDirectory();

    this.directoryError.set(null);

    this.isLoadingRoles.set(false);

  }

  // =======================================================
  // Clear Directory Data
  // =======================================================

  private clearDirectory(): void {

    this.roles.set([]);

    this.totalCount.set(0);

    this.totalPages.set(0);

    this.hasPreviousPage.set(false);

    this.hasNextPage.set(false);

  }

  // =======================================================
  // Cancel Current Directory Request
  // =======================================================

  private cancelDirectoryRequest(): void {

    ++this.directoryRequestVersion;

    this.directorySubscription?.unsubscribe();

    this.directorySubscription = null;

  }

  // =======================================================
  // Directory API Error Handling
  // =======================================================

  private getDirectoryErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {

      return (
        'Invalid role search, filter or ' +
        'pagination parameters.'
      );

    }

    if (error.status === 401) {

      return (
        'Your session is not authorized. ' +
        'Please sign in again.'
      );

    }

    if (error.status === 403) {

      return (
        'You do not have permission to view ' +
        'roles in this company.'
      );

    }

    if (error.status === 404) {

      return (
        'The selected company could not be ' +
        'found or is inactive.'
      );

    }

    if (error.status === 0) {

      return (
        'Unable to connect to the server. ' +
        'Check your connection.'
      );

    }

    if (error.status === 429) {

      return (
        'Too many requests. Please try again later.'
      );

    }

    return (
      'Unable to load roles. Please try again.'
    );

  }

}