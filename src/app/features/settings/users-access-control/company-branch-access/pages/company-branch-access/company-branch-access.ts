
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';

import {
  UserDirectoryItem,
  UserListQuery,
  UserPagedResult
} from '../../../user-management/models/user.model';

import {
  UserService
} from '../../../user-management/services/user.service';

import {
  UserBranchAccess,
  UserOrganizationAccess
} from '../../models/company-branch-access.model';

import {
  CompanyBranchAccessService
} from '../../services/company-branch-access.service';

import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';

import {
  EffectivePermissionService
} from '../../../../../../core/authorization/effective-permission.service';

import {
  PermissionCodes
} from '../../../../../../core/authorization/permission-registry';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';

type AccessAction =
  | 'company-grant'
  | 'branch-grant'
  | 'branch-revoke';

interface AccessConfirmation {
  action: AccessAction;
  companyId: number;
  userId: string;
  userName: string;
  branchId: number | null;
  branchName: string | null;
}

@Component({
  selector: 'app-company-branch-access',
  standalone: true,
  imports: [],
  templateUrl: './company-branch-access.html',
  styleUrl: './company-branch-access.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompanyBranchAccess {

  private readonly userService = inject(UserService);

  private readonly accessService =
    inject(CompanyBranchAccessService);

  private readonly workspace =
    inject(WorkspaceContextService);

  private readonly permissions =
    inject(EffectivePermissionService);

  private readonly notifications =
    inject(NotificationService);

  private readonly destroyRef = inject(DestroyRef);

  readonly companyId = this.workspace.companyId;

  readonly companyName =
    this.workspace.companyDisplayName;

  readonly canView = computed(() =>
    this.permissions.hasCompanyPermission(
      PermissionCodes.organizationAccess.view
    )
  );

  readonly canGrantCompany = computed(() =>
    this.permissions.hasCompanyPermission(
      PermissionCodes.organizationAccess.companyGrant
    )
  );

  readonly canGrantBranch = computed(() =>
    this.permissions.hasCompanyPermission(
      PermissionCodes.organizationAccess.branchGrant
    )
  );

  readonly canRevokeBranch = computed(() =>
    this.permissions.hasCompanyPermission(
      PermissionCodes.organizationAccess.branchRevoke
    )
  );

  readonly isPermissionReady =
    this.permissions.isCompanyReady;

  readonly users = signal<UserDirectoryItem[]>([]);

  readonly isLoadingUsers = signal(false);

  readonly directoryError =
    signal<string | null>(null);

  readonly searchText = signal('');

  readonly selectedIsActive =
    signal<boolean | null>(null);

  readonly pageNumber = signal(1);

  readonly pageSize = signal(20);

  readonly totalCount = signal(0);

  readonly totalPages = signal(0);

  readonly hasPreviousPage = signal(false);

  readonly hasNextPage = signal(false);

  readonly selectedUserId =
    signal<string | null>(null);

  readonly selectedUser = computed(() => {
    const userId = this.selectedUserId();

    return this.users().find(
      user => user.id === userId
    ) ?? null;
  });

  readonly organizationAccess =
    signal<UserOrganizationAccess | null>(null);

  readonly isLoadingAccess = signal(false);

  readonly accessError =
    signal<string | null>(null);

  readonly pendingConfirmation =
    signal<AccessConfirmation | null>(null);

  readonly isSavingAccess = signal(false);

  readonly mutationError =
    signal<string | null>(null);

  readonly activeBranchId =
    signal<number | null>(null);

  readonly branches = computed(
    () => this.organizationAccess()?.branches ?? []
  );

  readonly assignedBranchCount = computed(
    () => this.branches().filter(
      branch =>
        branch.hasDirectAssignment &&
        branch.isDirectAssignmentActive
    ).length
  );

  readonly isBusy = computed(
    () =>
      this.isLoadingUsers() ||
      this.isLoadingAccess() ||
      this.isSavingAccess()
  );

  private directorySubscription: Subscription | null = null;

  private accessSubscription: Subscription | null = null;

  private mutationSubscription: Subscription | null = null;

  private directoryRequestVersion = 0;

  private accessRequestVersion = 0;

  private mutationRequestVersion = 0;

  constructor() {
    effect(() => {
      const companyId = this.companyId();

      untracked(() => {
        this.resetForCompanyChange();

        if (companyId !== null && companyId > 0) {
          this.loadUsers();
        }
      });
    });

    effect(() => {
      const ready = this.isPermissionReady();
      const allowed = this.canView();

      untracked(() => {
        if (!ready || !allowed) {
          this.cancelAccessRequest();
          this.cancelMutationRequest();

          this.organizationAccess.set(null);
          this.pendingConfirmation.set(null);
          this.accessError.set(null);
          this.mutationError.set(null);
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelAccessRequest();
      this.cancelMutationRequest();
    });
  }

  loadUsers(): void {
    const companyId = this.companyId();

    this.cancelDirectoryRequest();

    const version = this.directoryRequestVersion;

    if (companyId === null || companyId <= 0) {
      this.clearDirectory();
      this.directoryError.set(null);
      this.isLoadingUsers.set(false);
      return;
    }

    const query: UserListQuery = {
      search: this.searchText().trim() || undefined,
      isActive: this.selectedIsActive() ?? undefined,
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingUsers.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.userService
      .getUsers(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.directoryRequestVersion) {
            this.isLoadingUsers.set(false);
          }
        })
      )
      .subscribe({
        next: (result: UserPagedResult) => {
          if (
            version !== this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.users.set(result.items);
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
              'Unable to load users. Please try again.'
            )
          );
        }
      });
  }

  refreshDirectory(): void {
    this.loadUsers();
  }

  searchUsers(search: string): void {
    this.searchText.set(search.trim());
    this.pageNumber.set(1);
    this.clearSelection();
    this.loadUsers();
  }

  filterByStatus(isActive: boolean | null): void {
    this.selectedIsActive.set(isActive);
    this.pageNumber.set(1);
    this.clearSelection();
    this.loadUsers();
  }

  clearFilters(): void {
    this.searchText.set('');
    this.selectedIsActive.set(null);
    this.pageNumber.set(1);
    this.clearSelection();
    this.loadUsers();
  }

  previousPage(): void {
    if (
      this.isLoadingUsers() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(
      page => Math.max(1, page - 1)
    );

    this.clearSelection();
    this.loadUsers();
  }

  nextPage(): void {
    if (
      this.isLoadingUsers() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(page => page + 1);

    this.clearSelection();
    this.loadUsers();
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
    this.clearSelection();
    this.loadUsers();
  }

  selectUser(user: UserDirectoryItem): void {
    const companyId = this.companyId();

    if (
      companyId === null ||
      companyId <= 0 ||
      !this.canView() ||
      this.isSavingAccess()
    ) {
      return;
    }

    if (this.selectedUserId() === user.id) {
      return;
    }

    this.cancelAccessRequest();

    this.selectedUserId.set(user.id);
    this.organizationAccess.set(null);
    this.accessError.set(null);
    this.mutationError.set(null);
    this.pendingConfirmation.set(null);

    this.loadUserAccess();
  }

  loadUserAccess(): void {
    const companyId = this.companyId();
    const userId = this.selectedUserId();

    this.cancelAccessRequest();

    const version = this.accessRequestVersion;

    if (
      companyId === null ||
      companyId <= 0 ||
      !userId ||
      !this.canView()
    ) {
      this.organizationAccess.set(null);
      this.isLoadingAccess.set(false);
      return;
    }

    this.isLoadingAccess.set(true);
    this.accessError.set(null);

    this.accessSubscription = this.accessService
      .getUserOrganizationAccess(companyId, userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.accessRequestVersion) {
            this.isLoadingAccess.set(false);
          }
        })
      )
      .subscribe({
        next: (access: UserOrganizationAccess) => {
          if (
            version !== this.accessRequestVersion ||
            this.companyId() !== companyId ||
            this.selectedUserId() !== userId ||
            !this.canView()
          ) {
            return;
          }

          if (
            access.companyId !== companyId ||
            access.userId !== userId ||
            !Array.isArray(access.branches)
          ) {
            this.organizationAccess.set(null);
            this.accessError.set(
              'The server returned invalid organization access information.'
            );
            return;
          }

          this.organizationAccess.set(access);
        },

        error: (error: HttpErrorResponse) => {
          if (
            version !== this.accessRequestVersion ||
            this.companyId() !== companyId ||
            this.selectedUserId() !== userId
          ) {
            return;
          }

          this.organizationAccess.set(null);

          this.accessError.set(
            this.getApiErrorMessage(
              error,
              'Unable to load organization access.'
            )
          );
        }
      });
  }

  refreshAccess(): void {
    if (this.isSavingAccess()) {
      return;
    }

    this.loadUserAccess();
  }

  requestCompanyGrant(): void {
    if (!this.canGrantCompany()) {
      return;
    }

    const access = this.organizationAccess();

    if (
      !access ||
      access.isCompanyAccessActive ||
      !access.isGlobalAccountActive
    ) {
      return;
    }

    this.prepareConfirmation(
      'company-grant',
      null
    );
  }

  requestBranchGrant(branch: UserBranchAccess): void {
    const access = this.organizationAccess();

    if (
      !this.canGrantBranch() ||
      !access ||
      !access.isGlobalAccountActive ||
      !access.isCompanyAccessActive ||
      !branch.isBranchActive ||
      (
        branch.hasDirectAssignment &&
        branch.isDirectAssignmentActive
      )
    ) {
      return;
    }

    this.prepareConfirmation(
      'branch-grant',
      branch
    );
  }

  requestBranchRevoke(branch: UserBranchAccess): void {
    const access = this.organizationAccess();

    if (
      !this.canRevokeBranch() ||
      !access ||
      !access.isCompanyAccessActive ||
      !branch.hasDirectAssignment ||
      !branch.isDirectAssignmentActive
    ) {
      return;
    }

    this.prepareConfirmation(
      'branch-revoke',
      branch
    );
  }

  private prepareConfirmation(
    action: AccessAction,
    branch: UserBranchAccess | null
  ): void {
    const companyId = this.companyId();
    const access = this.organizationAccess();

    if (
      companyId === null ||
      companyId <= 0 ||
      !access ||
      this.isBusy() ||
      this.pendingConfirmation() !== null ||
      this.selectedUserId() !== access.userId
    ) {
      return;
    }

    this.mutationError.set(null);

    this.pendingConfirmation.set({
      action,
      companyId,
      userId: access.userId,
      userName: access.fullName,
      branchId: branch?.branchId ?? null,
      branchName: branch?.name ?? null
    });
  }

  cancelConfirmation(): void {
    if (this.isSavingAccess()) {
      return;
    }

    this.pendingConfirmation.set(null);
  }

  confirmPendingAction(): void {
    const pending = this.pendingConfirmation();

    if (
      !pending ||
      this.isSavingAccess() ||
      this.companyId() !== pending.companyId ||
      this.selectedUserId() !== pending.userId ||
      !this.canView()
    ) {
      return;
    }

    const access = this.organizationAccess();

    if (
      !access ||
      access.userId !== pending.userId ||
      access.companyId !== pending.companyId
    ) {
      return;
    }

    if (
      pending.action === 'company-grant' &&
      (
        !this.canGrantCompany() ||
        access.isCompanyAccessActive ||
        !access.isGlobalAccountActive
      )
    ) {
      return;
    }

    const branch = pending.branchId === null
      ? null
      : access.branches.find(
          item => item.branchId === pending.branchId
        );

    if (pending.action !== 'company-grant') {
      if (!branch || !access.isCompanyAccessActive) {
        return;
      }

      if (
        pending.action === 'branch-grant' &&
        (
          !this.canGrantBranch() ||
          !access.isGlobalAccountActive ||
          !branch.isBranchActive ||
          (
            branch.hasDirectAssignment &&
            branch.isDirectAssignmentActive
          )
        )
      ) {
        return;
      }

      if (
        pending.action === 'branch-revoke' &&
        (
          !this.canRevokeBranch() ||
          !branch.hasDirectAssignment ||
          !branch.isDirectAssignmentActive
        )
      ) {
        return;
      }
    }

    this.cancelMutationRequest();

    const version = this.mutationRequestVersion;

    this.isSavingAccess.set(true);
    this.mutationError.set(null);
    this.activeBranchId.set(pending.branchId);

    const request$ = pending.action === 'company-grant'
      ? this.accessService.grantCompanyAccess(
          pending.companyId,
          pending.userId
        )
      : pending.action === 'branch-grant'
        ? this.accessService.grantBranchAccess(
            pending.companyId,
            pending.branchId!,
            pending.userId
          )
        : this.accessService.revokeBranchAccess(
            pending.companyId,
            pending.branchId!,
            pending.userId
          );

    this.mutationSubscription = request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.mutationRequestVersion) {
            this.isSavingAccess.set(false);
            this.activeBranchId.set(null);
          }
        })
      )
      .subscribe({
        next: response => {
          if (
            version !== this.mutationRequestVersion ||
            this.companyId() !== pending.companyId ||
            this.selectedUserId() !== pending.userId
          ) {
            return;
          }

          this.pendingConfirmation.set(null);

          const title =
            pending.action === 'company-grant'
              ? 'Invitation Created'
              : pending.action === 'branch-grant'
                ? 'Branch Access Granted'
                : 'Branch Access Revoked';

          this.notifications.success(
            response.message,
            { title }
          );

          this.loadUserAccess();
        },

        error: (error: HttpErrorResponse) => {
          if (
            version !== this.mutationRequestVersion ||
            this.companyId() !== pending.companyId ||
            this.selectedUserId() !== pending.userId
          ) {
            return;
          }

          this.pendingConfirmation.set(null);

          this.mutationError.set(
            this.getApiErrorMessage(
              error,
              'Unable to update organization access.'
            )
          );

          this.loadUserAccess();
        }
      });
  }

  private clearSelection(): void {
    this.cancelAccessRequest();
    this.cancelMutationRequest();

    this.selectedUserId.set(null);
    this.organizationAccess.set(null);
    this.pendingConfirmation.set(null);
    this.accessError.set(null);
    this.mutationError.set(null);
  }

  private resetForCompanyChange(): void {
    this.cancelDirectoryRequest();
    this.clearSelection();

    this.searchText.set('');
    this.selectedIsActive.set(null);
    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();
    this.directoryError.set(null);
    this.isLoadingUsers.set(false);
  }

  private clearDirectory(): void {
    this.users.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
    this.hasPreviousPage.set(false);
    this.hasNextPage.set(false);
  }

  private cancelDirectoryRequest(): void {
    ++this.directoryRequestVersion;
    this.directorySubscription?.unsubscribe();
    this.directorySubscription = null;
    this.isLoadingUsers.set(false);
  }

  private cancelAccessRequest(): void {
    ++this.accessRequestVersion;
    this.accessSubscription?.unsubscribe();
    this.accessSubscription = null;
    this.isLoadingAccess.set(false);
  }

  private cancelMutationRequest(): void {
    ++this.mutationRequestVersion;
    this.mutationSubscription?.unsubscribe();
    this.mutationSubscription = null;
    this.isSavingAccess.set(false);
    this.activeBranchId.set(null);
  }

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
        if (Array.isArray(response.errors)) {
          message = response.errors
            .filter(
              (item): item is string =>
                typeof item === 'string'
            )
            .join(' ');
        } else if (typeof response.errors === 'object') {
          message = Object.values(response.errors)
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
        return message || 'Invalid organization access request.';

      case 401:
        return 'Your session has expired. Please sign in again.';

      case 403:
        return 'You do not have permission to perform this operation.';

      case 404:
        return message || 'The company, user or branch was not found.';

      case 409:
        return (
          (message || 'Organization access has changed.') +
          ' Refresh the details before retrying.'
        );

      case 429:
        return 'Too many requests. Please try again later.';

      default:
        return message || fallback;
    }
  }
}