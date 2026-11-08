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
  DatePipe
} from '@angular/common';

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
  CreateUserRequest,
  UpdateUserRequest,
  UserDetails,
  UserDirectoryItem,
  UserListQuery,
  UserPagedResult
} from '../../models/user.model';

import {
  UserService,
  UserInvitationStatus
} from '../../services/user.service';

import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';

// =========================================================
// User Management Component
// =========================================================

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule
  ],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserManagement {

  // =======================================================
  // Dependencies
  // =======================================================

  private readonly userService = inject(UserService);

  private readonly notificationService = inject(NotificationService);

  private readonly workspaceContext = inject(
    WorkspaceContextService
  );

  private readonly destroyRef = inject(DestroyRef);

  private readonly formBuilder = inject(FormBuilder);

  // =======================================================
  // Workspace Context
  // =======================================================

  readonly companyId = this.workspaceContext.companyId;

  readonly companyName =
    this.workspaceContext.companyDisplayName;

  // =======================================================
  // User Directory State
  // =======================================================

  readonly users = signal<UserDirectoryItem[]>([]);

  readonly isLoadingUsers = signal(false);

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

  // =======================================================
  // User Form State
  // =======================================================

  readonly formMode = signal<'create' | 'edit' | null>(null);

  readonly selectedUserId = signal<string | null>(null);

  readonly isLoadingUserDetails = signal(false);

  readonly isSavingUser = signal(false);

  readonly userFormError = signal<string | null>(null);

  readonly userFormSuccess = signal<string | null>(null);

  readonly userDetailsLoaded = signal(false);

  // =======================================================
  // User Status State
  // =======================================================

  readonly changingStatusUserId = signal<string | null>(null);

  readonly userStatusError = signal<string | null>(null);

  readonly userStatusSuccess = signal<string | null>(null);

  readonly pendingConfirmation = signal<{
    user: UserDirectoryItem;
    action: 'reissue' | 'revoke' | 'activate' | 'deactivate';
    companyId: number;
  } | null>(null);

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  confirmPendingAction(): void {
    const pending = this.pendingConfirmation();
    if (!pending || this.companyId() !== pending.companyId) {
      this.pendingConfirmation.set(null);
      return;
    }
    this.pendingConfirmation.set(null);
    if (pending.action === 'reissue' || pending.action === 'revoke') {
      this.performInvitationAction(pending.user, pending.action, true);
    } else {
      this.changeUserStatus(pending.user, pending.action === 'activate', true);
    }
  }

  readonly invitationActionUserId = signal<string | null>(null);
  readonly invitationActionError = signal<string | null>(null);
  readonly invitationStatus = signal<UserInvitationStatus | null>(null);
  readonly isLoadingInvitationStatus = signal(false);
  private invitationSubscription: Subscription | null = null;
  private invitationStatusSubscription: Subscription | null = null;
  private invitationRequestVersion = 0;

  // =======================================================
  // Reactive Form
  // =======================================================

  readonly userForm = this.formBuilder.nonNullable.group({
    fullName: [
      '',
      [
        Validators.required,
        Validators.maxLength(200)
      ]
    ],
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(256)
      ]
    ]
  });

  // =======================================================
  // Request Lifecycle
  // =======================================================

  private directorySubscription: Subscription | null = null;

  private directoryRequestVersion = 0;

  private userDetailsSubscription: Subscription | null = null;

  private userSaveSubscription: Subscription | null = null;

  private userFormRequestVersion = 0;

  private userStatusSubscription: Subscription | null = null;

  private userStatusRequestVersion = 0;

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
          this.loadUsers();
        }

      });

    });

    // Cancel outstanding requests when the
    // component is destroyed.

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelUserFormRequests();
      this.cancelUserStatusRequest();
      this.cancelInvitationRequests();
    });

  }

  // =======================================================
  // Load Users
  // =======================================================

  loadUsers(): void {

    const companyId = this.companyId();

    this.cancelDirectoryRequest();

    const requestVersion =
      ++this.directoryRequestVersion;

    if (
      companyId === null ||
      companyId <= 0
    ) {

      this.clearDirectory();

      this.isLoadingUsers.set(false);

      this.directoryError.set(null);

      return;
    }

    const query: UserListQuery = {

      search:
        this.searchText().trim() || undefined,

      isActive:
        this.selectedIsActive() ?? undefined,

      pageNumber:
        this.pageNumber(),

      pageSize:
        this.pageSize()

    };

    this.isLoadingUsers.set(true);

    this.directoryError.set(null);

    this.directorySubscription = this.userService
      .getUsers(companyId, query)
      .pipe(

        takeUntilDestroyed(this.destroyRef),

        finalize(() => {

          if (
            requestVersion ===
            this.directoryRequestVersion
          ) {

            this.isLoadingUsers.set(false);

          }

        })

      )
      .subscribe({

        next: (result: UserPagedResult) => {

          // Ignore stale responses from an earlier
          // request or a different company.

          if (
            requestVersion !==
              this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.users.set(result.items);

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

    this.loadUsers();

  }

  // =======================================================
  // Search Users
  // =======================================================

  searchUsers(search: string): void {

    this.searchText.set(
      search.trim()
    );

    this.pageNumber.set(1);

    this.loadUsers();

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

    this.loadUsers();

  }

  // =======================================================
  // Reset Filters
  // =======================================================

  clearFilters(): void {

    this.searchText.set('');

    this.selectedIsActive.set(null);

    this.pageNumber.set(1);

    this.loadUsers();

  }

  // =======================================================
  // Previous Page
  // =======================================================

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

    this.loadUsers();

  }

  // =======================================================
  // Next Page
  // =======================================================

  nextPage(): void {

    if (
      this.isLoadingUsers() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(
      page => page + 1
    );

    this.loadUsers();

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

    this.loadUsers();

  }

  // =======================================================
  // Open Create User Form
  // =======================================================

  openCreateUser(): void {

    const companyId = this.companyId();

    if (
      companyId === null ||
      companyId <= 0 ||
      this.isSavingUser() ||
      this.changingStatusUserId() !== null
    ) {
      return;
    }

    this.cancelUserFormRequests();

    this.userForm.reset({
      fullName: '',
      email: ''
    });


    this.selectedUserId.set(null);

    this.userDetailsLoaded.set(false);

    this.userFormError.set(null);

    this.userFormSuccess.set(null);

    this.formMode.set('create');

  }

  // =======================================================
  // Open Edit User Form
  // =======================================================

  openEditUser(userId: string): void {

    const companyId = this.companyId();

    if (
      companyId === null ||
      companyId <= 0 ||
      !userId ||
      this.isSavingUser() ||
      this.changingStatusUserId() !== null
    ) {
      return;
    }

    this.cancelUserFormRequests();

    const requestVersion =
      this.userFormRequestVersion;

    this.userForm.reset({
      fullName: '',
      email: ''
    });


    this.formMode.set('edit');

    this.selectedUserId.set(userId);

    this.userDetailsLoaded.set(false);

    this.userFormError.set(null);

    this.userFormSuccess.set(null);

    this.isLoadingUserDetails.set(true);

    this.userDetailsSubscription = this.userService
      .getUserDetails(companyId, userId)
      .pipe(

        takeUntilDestroyed(this.destroyRef),

        finalize(() => {

          if (
            requestVersion ===
            this.userFormRequestVersion
          ) {

            this.isLoadingUserDetails.set(false);

          }

        })

      )
      .subscribe({

        next: (user: UserDetails) => {

          if (
            requestVersion !==
              this.userFormRequestVersion ||
            this.companyId() !== companyId ||
            this.selectedUserId() !== userId
          ) {
            return;
          }

          this.userForm.patchValue({
            fullName: user.fullName,
            email: user.email ?? ''
          });

          this.userDetailsLoaded.set(true);

        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !==
              this.userFormRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.userDetailsLoaded.set(false);

          this.userFormError.set(
            this.getUserFormErrorMessage(error)
          );

        }

      });

  }

  // =======================================================
  // Save User
  // =======================================================

  saveUser(): void {

    const companyId = this.companyId();

    const mode = this.formMode();

    if (
      companyId === null ||
      companyId <= 0 ||
      mode === null ||
      this.isSavingUser() ||
      this.isLoadingUserDetails() ||
      this.changingStatusUserId() !== null
    ) {
      return;
    }

    // Prevent saving an Edit Form if the
    // User Details request failed.

    if (
      mode === 'edit' &&
      !this.userDetailsLoaded()
    ) {
      this.userFormError.set(
        'User details could not be loaded. ' +
        'Please reopen the user and try again.'
      );

      return;
    }

    const currentValues = this.userForm.getRawValue();
    const fullName = currentValues.fullName.trim();
    const email = currentValues.email.trim();

    this.userForm.patchValue({ fullName, email });
    this.userForm.updateValueAndValidity();

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    if (!fullName || !email) {

      this.userFormError.set(
        'Full name and email are required.'
      );

      return;
    }

    const selectedUserId = this.selectedUserId();

    if (
      mode === 'edit' &&
      !selectedUserId
    ) {
      return;
    }

    this.cancelUserFormRequests();

    const requestVersion =
      this.userFormRequestVersion;

    this.isSavingUser.set(true);

    this.userFormError.set(null);

    this.userFormSuccess.set(null);

    const request$ = mode === 'create'
      ? this.userService.createUser(
          companyId,
          {
            fullName,
            email
          } satisfies CreateUserRequest
        )
      : this.userService.updateUser(
          companyId,
          selectedUserId!,
          {
            fullName,
            email
          } satisfies UpdateUserRequest
        );

    this.userSaveSubscription = request$
      .pipe(

        takeUntilDestroyed(this.destroyRef),

        finalize(() => {

          if (
            requestVersion ===
            this.userFormRequestVersion
          ) {

            this.isSavingUser.set(false);

          }

        })

      )
      .subscribe({

        next: response => {

          if (
            requestVersion !==
              this.userFormRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.formMode.set(null);

          this.selectedUserId.set(null);

          this.userDetailsLoaded.set(false);

          this.userForm.reset();

          const successMessage =
            response?.message?.trim() ||
            (mode === 'create'
              ? 'User invitation created successfully. An email will be sent when delivery is configured.'
              : 'User updated successfully.');

          this.notificationService.success(successMessage, {
            title: mode === 'create' ? 'Invitation Created' : 'User Updated'
          });

          this.loadUsers();

        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !==
              this.userFormRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.userFormError.set(
            this.getUserFormErrorMessage(error)
          );

        }

      });

  }

  // =======================================================
  // Close User Form
  // =======================================================

  closeUserForm(): void {

    if (this.isSavingUser()) {
      return;
    }

    this.cancelUserFormRequests();

    this.formMode.set(null);

    this.selectedUserId.set(null);

    this.userDetailsLoaded.set(false);

    this.userFormError.set(null);

    this.userForm.reset();

  }

  // =======================================================
  // Activate User
  // =======================================================

  activateUser(user: UserDirectoryItem): void {

    this.changeUserStatus(user, true);

  }

  // =======================================================
  // Deactivate User
  // =======================================================

  deactivateUser(user: UserDirectoryItem): void {

    this.changeUserStatus(user, false);

  }

  // =======================================================
  // Change Company User Status
  // =======================================================

  private changeUserStatus(
    user: UserDirectoryItem,
    activate: boolean,
    confirmed = false
  ): void {

    const companyId = this.companyId();

    if (
      companyId === null ||
      companyId <= 0 ||
      this.changingStatusUserId() !== null ||
      this.isSavingUser() ||
      this.isLoadingUsers()
    ) {
      return;
    }

    if (user.isActive === activate) {
      return;
    }

    if (!confirmed) {
      this.pendingConfirmation.set({
        user,
        action: activate ? 'activate' : 'deactivate',
        companyId
      });
      return;
    }

    const requestVersion =
      ++this.userStatusRequestVersion;

    this.changingStatusUserId.set(user.id);

    this.userStatusError.set(null);

    this.userStatusSuccess.set(null);

    const request$ = activate
      ? this.userService.activateUser(
          companyId,
          user.id
        )
      : this.userService.deactivateUser(
          companyId,
          user.id
        );

    this.userStatusSubscription = request$
      .pipe(

        takeUntilDestroyed(this.destroyRef),

        finalize(() => {

          if (
            requestVersion ===
            this.userStatusRequestVersion
          ) {

            this.changingStatusUserId.set(null);

          }

        })

      )
      .subscribe({

        next: () => {

          if (
            requestVersion !==
              this.userStatusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.notificationService.success(
            `User company access ${activate ? 'activated' : 'deactivated'} successfully.`,
            { title: activate ? 'User Activated' : 'User Deactivated' }
          );

          this.loadUsers();

        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !==
              this.userStatusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.userStatusError.set(
            this.getUserStatusErrorMessage(error)
          );

        }

      });

  }

  // =======================================================
  // Invitation Actions
  // =======================================================

  loadInvitationStatus(userId: string): void {
    const companyId = this.companyId();
    if (companyId === null || companyId <= 0 || !userId) return;

    this.invitationStatusSubscription?.unsubscribe();
    const version = ++this.invitationRequestVersion;
    this.invitationStatus.set(null);
    this.isLoadingInvitationStatus.set(true);

    this.invitationStatusSubscription = this.userService
      .getInvitationStatus(companyId, userId)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
        if (version === this.invitationRequestVersion) {
          this.isLoadingInvitationStatus.set(false);
        }
      }))
      .subscribe({
        next: status => {
          if (version !== this.invitationRequestVersion || this.companyId() !== companyId) return;
          this.invitationStatus.set(status);
        },
        error: (error: HttpErrorResponse) => {
          if (version !== this.invitationRequestVersion || this.companyId() !== companyId) return;
          this.invitationActionError.set(this.getInvitationErrorMessage(error));
        }
      });
  }

  reissueInvitation(user: UserDirectoryItem): void {
    this.performInvitationAction(user, 'reissue');
  }

  revokeInvitation(user: UserDirectoryItem): void {
    this.performInvitationAction(user, 'revoke');
  }

  private performInvitationAction(
    user: UserDirectoryItem,
    action: 'reissue' | 'revoke',
    confirmed = false
  ): void {
    const companyId = this.companyId();
    if (companyId === null || companyId <= 0 || !user.id ||
        this.invitationActionUserId() !== null || this.isSavingUser() ||
        this.changingStatusUserId() !== null || this.isLoadingUsers()) return;

    if (!confirmed) {
      this.pendingConfirmation.set({ user, action, companyId });
      return;
    }

    this.invitationStatusSubscription?.unsubscribe();
    this.invitationSubscription?.unsubscribe();
    const version = ++this.invitationRequestVersion;
    this.invitationActionUserId.set(user.id);
    this.invitationActionError.set(null);

    const request$ = action === 'reissue'
      ? this.userService.reissueInvitation(companyId, user.id)
      : this.userService.revokeInvitation(companyId, user.id);

    this.invitationSubscription = request$
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
        if (version === this.invitationRequestVersion) this.invitationActionUserId.set(null);
      }))
      .subscribe({
        next: response => {
          if (version !== this.invitationRequestVersion || this.companyId() !== companyId) return;
          this.notificationService.success(
            response.message || (action === 'reissue'
              ? 'A new invitation has been queued.'
              : 'Invitation revoked successfully.'),
            { title: action === 'reissue' ? 'Invitation Reissued' : 'Invitation Revoked' }
          );
          this.invitationActionUserId.set(null);
          this.loadUsers();
          this.loadInvitationStatus(user.id);
        },
        error: (error: HttpErrorResponse) => {
          if (version !== this.invitationRequestVersion || this.companyId() !== companyId) return;
          this.invitationActionError.set(this.getInvitationErrorMessage(error));
        }
      });
  }

  private cancelInvitationRequests(): void {
    ++this.invitationRequestVersion;
    this.invitationSubscription?.unsubscribe();
    this.invitationStatusSubscription?.unsubscribe();
    this.invitationSubscription = null;
    this.invitationStatusSubscription = null;
    this.invitationActionUserId.set(null);
    this.isLoadingInvitationStatus.set(false);
  }

  private getInvitationErrorMessage(error: HttpErrorResponse): string {
    const response = this.getApiErrorBody(error);
    if (error.status === 401) return 'Session expired. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to manage invitations.';
    if (error.status === 404) return response?.message || 'Invitation or user not found.';
    if (error.status === 409) return response?.message || 'Invitation state conflict.';
    if (error.status === 429) return 'Too many requests. Please try again later.';
    if (error.status === 0) return 'Unable to connect to the server.';
    return response?.message || 'Unable to process invitation. Please try again.';
  }

  // =======================================================
  // Reset Directory on Company Change
  // =======================================================

  private resetDirectoryForCompanyChange(): void {

    this.cancelDirectoryRequest();

    this.cancelUserFormRequests();

    this.cancelUserStatusRequest();
    this.cancelInvitationRequests();
    this.pendingConfirmation.set(null);
    this.invitationStatus.set(null);
    this.invitationActionError.set(null);

    this.formMode.set(null);

    this.selectedUserId.set(null);

    this.userDetailsLoaded.set(false);

    this.userFormError.set(null);

    this.userFormSuccess.set(null);

    this.userStatusError.set(null);

    this.userStatusSuccess.set(null);

    this.userForm.reset();

    this.searchText.set('');

    this.selectedIsActive.set(null);

    this.pageNumber.set(1);

    this.pageSize.set(20);

    this.clearDirectory();

    this.directoryError.set(null);

    this.isLoadingUsers.set(false);

  }

  // =======================================================
  // Clear Directory Data
  // =======================================================

  private clearDirectory(): void {

    this.users.set([]);

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
  // Cancel Form Requests
  // =======================================================

  private cancelUserFormRequests(): void {

    ++this.userFormRequestVersion;

    this.userDetailsSubscription?.unsubscribe();

    this.userSaveSubscription?.unsubscribe();

    this.userDetailsSubscription = null;

    this.userSaveSubscription = null;

    this.isLoadingUserDetails.set(false);

    this.isSavingUser.set(false);

  }

  // =======================================================
  // Cancel User Status Request
  // =======================================================

  private cancelUserStatusRequest(): void {

    ++this.userStatusRequestVersion;

    this.userStatusSubscription?.unsubscribe();

    this.userStatusSubscription = null;

    this.changingStatusUserId.set(null);

  }

  // =======================================================
  // Directory API Error Handling
  // =======================================================

  private getDirectoryErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {

      return (
        'Invalid user search or pagination parameters.'
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
        'users in this company.'
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

    return (
      'Unable to load users. Please try again.'
    );

  }

  // =======================================================
  // User Form API Error Handling
  // =======================================================

  private getUserFormErrorMessage(
    error: HttpErrorResponse
  ): string {

    const response = this.getApiErrorBody(error);

    if (error.status === 400 || error.status === 422) {
      return (
        this.getValidationErrors(response) ||
        response?.message ||
        response?.title ||
        'Please check the form values.'
      );
    }

    if (error.status === 401) {

      return (
        'Your session has expired. ' +
        'Please sign in again.'
      );

    }

    if (error.status === 403) {

      return (
        'You do not have permission ' +
        'to perform this action.'
      );

    }

    if (error.status === 404) {

      return (
        'The company or user could not be found.'
      );

    }

    if (error.status === 409) {

      return (
        response?.message ||
        'This operation conflicts with existing user data.'
      );

    }

    if (error.status === 0) {

      return (
        'Unable to connect to the server.'
      );

    }

    return (
      'Unable to save the user. Please try again.'
    );

  }

  // =======================================================
  // User Status API Error Handling
  // =======================================================

  private getUserStatusErrorMessage(
    error: HttpErrorResponse
  ): string {

    const response = this.getApiErrorBody(error);

    if (error.status === 400) {

      return (
        response?.message ||
        'Invalid user status request.'
      );

    }

    if (error.status === 401) {

      return (
        'Your session has expired. ' +
        'Please sign in again.'
      );

    }

    if (error.status === 403) {

      return (
        response?.message ||
        'You do not have permission ' +
        'to change this user status.'
      );

    }

    if (error.status === 404) {

      return (
        'The selected user or company ' +
        'could not be found.'
      );

    }

    if (error.status === 409) {

      return (
        response?.message ||
        'This status change conflicts ' +
        'with company access rules.'
      );

    }

    if (error.status === 0) {

      return (
        'Unable to connect to the server.'
      );

    }

    return (
      response?.message ||
      'Unable to change user status. Please try again.'
    );

  }


  // Handles both custom API errors and ASP.NET Core ProblemDetails.
  private getApiErrorBody(error: HttpErrorResponse): {
    message?: string;
    title?: string;
    errors?: unknown;
  } | null {
    const body: unknown = error.error;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }
    return body as { message?: string; title?: string; errors?: unknown };
  }

  private getValidationErrors(response: { errors?: unknown } | null): string | null {
    const errors = response?.errors;
    if (Array.isArray(errors)) {
      const messages = errors.filter((value): value is string => typeof value === 'string');
      return messages.join(' ') || null;
    }
    if (errors !== null && typeof errors === 'object') {
      const messages = Object.values(errors)
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === 'string');
      return messages.join(' ') || null;
    }
    return null;
  }

}