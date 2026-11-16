
import { HttpClient } from '@angular/common/http';
import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked
} from '@angular/core';
import { Subscription } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/services/auth.service';
import { WorkspaceContextService } from '../workspace/services/workspace-context.service';
import {
  PermissionCode,
  PermissionScope
} from './permission-registry';

export interface EffectivePermissionsResponse {
  companyId: number;
  branchId: number | null;
  scope: 'company' | 'branch';
  permissionCodes: string[];
}

type PermissionLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

@Injectable({
  providedIn: 'root'
})
export class EffectivePermissionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceContextService);

  private readonly companyPermissionsState =
    signal<ReadonlySet<string>>(new Set<string>());

  private readonly branchPermissionsState =
    signal<ReadonlySet<string>>(new Set<string>());

  private readonly companyStatusState =
    signal<PermissionLoadStatus>('idle');

  private readonly branchStatusState =
    signal<PermissionLoadStatus>('idle');

  private companySubscription: Subscription | null = null;
  private branchSubscription: Subscription | null = null;

  private requestVersion = 0;

  readonly companyStatus =
    this.companyStatusState.asReadonly();

  readonly branchStatus =
    this.branchStatusState.asReadonly();

  readonly isCompanyReady = computed(
    () => this.companyStatus() === 'ready'
  );

  readonly isBranchReady = computed(
    () => this.branchStatus() === 'ready'
  );

  readonly isLoading = computed(
    () =>
      this.companyStatus() === 'loading' ||
      this.branchStatus() === 'loading'
  );

  readonly isReady = computed(
    () =>
      this.isCompanyReady() &&
      (
        !this.workspace.hasBranch() ||
        this.isBranchReady()
      )
  );

  constructor() {
    effect(() => {
      const sessionGeneration =
        this.auth.sessionGenerationSignal();

      const initialized =
        this.workspace.isInitialized();

      const companyId =
        this.workspace.companyId();

      const branchId =
        this.workspace.branchId();

      untracked(() => {
        this.loadPermissions(
          sessionGeneration,
          initialized,
          companyId,
          branchId
        );
      });
    });
  }

  hasPermission(
    code: PermissionCode,
    scope: PermissionScope
  ): boolean {
    if (!this.auth.isAuthenticated()) {
      return false;
    }

    if (!this.workspace.isInitialized()) {
      return false;
    }

    if (scope === 'company') {
      return (
        this.isCompanyReady() &&
        this.companyPermissionsState().has(code)
      );
    }

    if (scope === 'branch') {
      return (
        this.workspace.hasBranch() &&
        this.isBranchReady() &&
        this.branchPermissionsState().has(code)
      );
    }

    return false;
  }

  hasCompanyPermission(code: PermissionCode): boolean {
    return this.hasPermission(code, 'company');
  }

  hasBranchPermission(code: PermissionCode): boolean {
    return this.hasPermission(code, 'branch');
  }

  refresh(): void {
    this.loadPermissions(
      this.auth.getSessionGeneration(),
      this.workspace.isInitialized(),
      this.workspace.companyId(),
      this.workspace.branchId()
    );
  }

  private loadPermissions(
    sessionGeneration: number,
    initialized: boolean,
    companyId: number | null,
    branchId: number | null
  ): void {
    this.cancelRequests();

    this.companyPermissionsState.set(new Set<string>());
    this.branchPermissionsState.set(new Set<string>());

    this.companyStatusState.set('idle');
    this.branchStatusState.set('idle');

    if (
      !initialized ||
      !this.auth.isAuthenticated() ||
      companyId === null ||
      companyId <= 0
    ) {
      return;
    }

    const version = this.requestVersion;

    this.companyStatusState.set('loading');

    this.companySubscription = this.http
      .get<EffectivePermissionsResponse>(
        `${environment.apiBaseUrl}/companies/${companyId}/authorization/effective-permissions`
      )
      .subscribe({
        next: response => {
          if (
            !this.isCurrentRequest(
              version,
              sessionGeneration,
              companyId,
              branchId
            )
          ) {
            return;
          }

          if (
            !this.isValidResponse(
              response,
              companyId,
              null,
              'company'
            )
          ) {
            this.companyStatusState.set('error');
            return;
          }

          this.companyPermissionsState.set(
            new Set(response.permissionCodes)
          );

          this.companyStatusState.set('ready');
        },
        error: () => {
          if (version !== this.requestVersion) {
            return;
          }

          this.companyPermissionsState.set(
            new Set<string>()
          );

          this.companyStatusState.set('error');
        }
      });

    if (branchId === null || branchId <= 0) {
      return;
    }

    this.branchStatusState.set('loading');

    this.branchSubscription = this.http
      .get<EffectivePermissionsResponse>(
        `${environment.apiBaseUrl}/companies/${companyId}/authorization/branches/${branchId}/effective-permissions`
      )
      .subscribe({
        next: response => {
          if (
            !this.isCurrentRequest(
              version,
              sessionGeneration,
              companyId,
              branchId
            )
          ) {
            return;
          }

          if (
            !this.isValidResponse(
              response,
              companyId,
              branchId,
              'branch'
            )
          ) {
            this.branchStatusState.set('error');
            return;
          }

          this.branchPermissionsState.set(
            new Set(response.permissionCodes)
          );

          this.branchStatusState.set('ready');
        },
        error: () => {
          if (version !== this.requestVersion) {
            return;
          }

          this.branchPermissionsState.set(
            new Set<string>()
          );

          this.branchStatusState.set('error');
        }
      });
  }

  private isCurrentRequest(
    version: number,
    sessionGeneration: number,
    companyId: number,
    branchId: number | null
  ): boolean {
    return (
      version === this.requestVersion &&
      this.auth.getSessionGeneration() ===
        sessionGeneration &&
      this.auth.isAuthenticated() &&
      this.workspace.isInitialized() &&
      this.workspace.companyId() === companyId &&
      this.workspace.branchId() === branchId
    );
  }

  private isValidResponse(
    response: EffectivePermissionsResponse,
    companyId: number,
    branchId: number | null,
    scope: 'company' | 'branch'
  ): boolean {
    return (
      response !== null &&
      response.companyId === companyId &&
      response.branchId === branchId &&
      response.scope === scope &&
      Array.isArray(response.permissionCodes) &&
      response.permissionCodes.every(
        code => typeof code === 'string'
      )
    );
  }

  private cancelRequests(): void {
    ++this.requestVersion;

    this.companySubscription?.unsubscribe();
    this.branchSubscription?.unsubscribe();

    this.companySubscription = null;
    this.branchSubscription = null;
  }
}