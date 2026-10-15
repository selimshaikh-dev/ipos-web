import {
  computed,
  inject,
  Injectable,
  signal
} from '@angular/core';

import {
  INITIAL_WORKSPACE_CONTEXT,
  WorkspaceContext
} from '../models/workspace-context.model';

import {
  WorkspaceBranchOption,
  WorkspaceCompanyOption
} from '../models/workspace-options.model';

import { TokenService } from '../../auth/services/token.service';

// =========================================================
// Workspace Initialization Status
// =========================================================

export type WorkspaceInitializationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceContextService {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly tokenService = inject(TokenService);

  private readonly storagePrefix = 'ipos_workspace_branch';

  // =========================================================
  // Workspace State
  // =========================================================

  private readonly workspaceState = signal<WorkspaceContext>({
    ...INITIAL_WORKSPACE_CONTEXT
  });

  readonly workspace = this.workspaceState.asReadonly();

  // =========================================================
  // Workspace Initialization State
  // =========================================================

  private readonly initializationState =
    signal<WorkspaceInitializationStatus>('idle');

  readonly initializationStatus =
    this.initializationState.asReadonly();

  readonly isInitializing = computed(
    () => this.initializationStatus() === 'loading'
  );

  readonly isInitialized = computed(
    () => this.initializationStatus() === 'ready'
  );

  readonly hasInitializationError = computed(
    () => this.initializationStatus() === 'error'
  );

  /**
   * Marks the beginning of an authorized workspace
   * initialization request.
   *
   * Does not automatically clear existing context.
   */
  beginInitialization(): void {
    this.initializationState.set('loading');
  }

  /**
   * Marks workspace initialization as failed.
   *
   * Clears in-memory company and branch data.
   * Persisted branch preferences are preserved.
   */
  failInitialization(): void {
    this.clear();
    this.initializationState.set('error');
  }

  // =========================================================
  // Authorized Branch Options
  // =========================================================

  private readonly branchOptionsState =
    signal<readonly WorkspaceBranchOption[]>([]);

  readonly branchOptions =
    this.branchOptionsState.asReadonly();

  readonly hasMultipleBranches = computed(
    () => this.branchOptionsState().length > 1
  );

  readonly requiresBranchSelection = computed(
    () =>
      this.isInitialized() &&
      this.hasCompany() &&
      this.branchOptionsState().length > 0 &&
      !this.hasBranch()
  );

  // =========================================================
  // Company State
  // =========================================================

  readonly companyId = computed(
    () => this.workspaceState().companyId
  );

  readonly companyName = computed(
    () => this.workspaceState().companyName
  );

  readonly companyCode = computed(
    () => this.workspaceState().companyCode
  );

  readonly hasCompany = computed(
    () => this.companyId() !== null
  );

  // =========================================================
  // Branch State
  // =========================================================

  readonly branchId = computed(
    () => this.workspaceState().branchId
  );

  readonly branchName = computed(
    () => this.workspaceState().branchName
  );

  readonly hasBranch = computed(
    () => this.branchId() !== null
  );

  // =========================================================
  // Route Access State
  // =========================================================

  /**
   * Company-level routes require a successfully
   * initialized, authorized company.
   */
  readonly canAccessCompanyRoutes = computed(
    () =>
      this.isInitialized() &&
      this.hasCompany()
  );

  /**
   * Branch-level routes additionally require a
   * selected branch from the authorized options.
   */
  readonly canAccessBranchRoutes = computed(
    () =>
      this.canAccessCompanyRoutes() &&
      this.hasBranch()
  );

  // =========================================================
  // Display State
  // =========================================================

  readonly companyDisplayName = computed(() => {
    const name = this.companyName().trim();

    return name || 'No company selected';
  });

  readonly branchDisplayName = computed(() => {
    return this.branchName()?.trim() || 'No branch selected';
  });

  readonly companyInitials = computed(() => {
    const name = this.companyName().trim();

    if (!name) {
      return '--';
    }

    const words = name.split(/\s+/).filter(Boolean);

    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }

    return (
      words[0].charAt(0) +
      words[1].charAt(0)
    ).toUpperCase();
  });

  // =========================================================
  // Workspace Initialization
  // =========================================================

  /**
   * Initializes workspace display state.
   *
   * Does not populate authorized branch options.
   * The workspace/options API remains the source of truth.
   *
   * This method intentionally does not mark the
   * workspace as authorized or ready.
   */
  initialize(context: WorkspaceContext): void {

    this.workspaceState.set({
      ...context
    });

    this.branchOptionsState.set([]);

    this.initializationState.set('idle');
  }

  // =========================================================
  // Authorized Company Workspace Configuration
  // =========================================================

  /**
   * Configures a company returned by the authenticated
   * workspace/options API.
   *
   * Restores a saved branch only when it remains present
   * in the current server-authorized branch options.
   */
  configureCompany(
    company: WorkspaceCompanyOption,
    preferredBranchId: number | null = null
  ): void {

    const branches = [...company.branches];

    const savedBranchId = this.getSavedBranchId(
      company.id
    );

    const requestedBranchId =
      preferredBranchId ?? savedBranchId;

    const requestedBranch =
      requestedBranchId === null
        ? undefined
        : branches.find(
            branch => branch.id === requestedBranchId
          );

    const selectedBranch =
      requestedBranch ??
      (branches.length === 1 ? branches[0] : null);

    this.branchOptionsState.set(branches);

    this.workspaceState.set({
      companyId: company.id,
      companyName: company.name,
      companyCode: company.code,
      branchId: selectedBranch?.id ?? null,
      branchName: selectedBranch?.name ?? null
    });

    // Authorized company configuration is complete.
    // A branch may still need to be selected.

    this.initializationState.set('ready');

    // An outdated or unauthorized saved selection must
    // not remain in browser storage.

    if (
      savedBranchId !== null &&
      !branches.some(
        branch => branch.id === savedBranchId
      )
    ) {
      this.removeSavedBranchId(company.id);
    }
  }

  // =========================================================
  // Server-Authorized Branch Synchronization
  // =========================================================

  /**
   * Refreshes branch options for the currently selected company.
   *
   * Only data returned by the authenticated workspace/options API
   * should be passed here. Branch-management DTOs are not an
   * authorization source.
   *
   * Returns false when the response is for a different company or
   * the workspace has not finished initialization.
   */
  synchronizeAuthorizedBranches(
    company: WorkspaceCompanyOption
  ): boolean {

    if (
      !this.isInitialized() ||
      this.companyId() !== company.id
    ) {
      return false;
    }

    const branches = [...company.branches];
    const currentBranchId = this.branchId();
    const savedBranchId = this.getSavedBranchId(company.id);

    // Preserve the current selection only while it is still
    // present in the server-authorized branch options.
    const retainedBranch = currentBranchId === null
      ? undefined
      : branches.find(branch => branch.id === currentBranchId);

    // Match initial configuration behavior when exactly one
    // authorized branch remains available.
    const selectedBranch = retainedBranch ??
      (branches.length === 1 ? branches[0] : null);

    this.branchOptionsState.set(branches);

    this.workspaceState.update(current => ({
      ...current,
      branchId: selectedBranch?.id ?? null,
      branchName: selectedBranch?.name ?? null
    }));

    // Remove a saved preference that the server no longer permits.
    if (
      savedBranchId !== null &&
      !branches.some(branch => branch.id === savedBranchId)
    ) {
      this.removeSavedBranchId(company.id);
    }

    // If a different branch was auto-selected, keep the saved
    // preference consistent with the new authorized selection.
    if (
      selectedBranch &&
      selectedBranch.id !== savedBranchId
    ) {
      this.saveBranchId(company.id, selectedBranch.id);
    }

    return true;
  }

  // =========================================================
  // Branch Selection
  // =========================================================

  /**
   * Selects a branch from the currently loaded
   * server-authorized branch options.
   *
   * This is not a backend authorization decision.
   */
  selectBranch(branchId: number): boolean {

    if (!this.isInitialized()) {
      return false;
    }

    const companyId = this.companyId();

    if (companyId === null) {
      return false;
    }

    const branch = this.branchOptionsState().find(
      option => option.id === branchId
    );

    if (!branch) {
      return false;
    }

    this.workspaceState.update(current => ({
      ...current,
      branchId: branch.id,
      branchName: branch.name
    }));

    this.saveBranchId(companyId, branch.id);

    return true;
  }

  // =========================================================
  // Company Display Synchronization
  // =========================================================

  synchronizeCompany(
    companyId: number,
    companyName: string,
    companyCode: string
  ): void {

    this.workspaceState.update(current => {

      if (current.companyId !== companyId) {
        return current;
      }

      return {
        ...current,
        companyName,
        companyCode
      };
    });
  }

  // =========================================================
  // Persistence Helpers
  // =========================================================

  private getStorageKey(
    companyId: number
  ): string | null {

    const userId =
      this.tokenService.getUser()?.userId;

    if (!userId) {
      return null;
    }

    return `${this.storagePrefix}:${userId}:${companyId}`;
  }

  private getSavedBranchId(
    companyId: number
  ): number | null {

    const key = this.getStorageKey(companyId);

    if (!key) {
      return null;
    }

    const value = sessionStorage.getItem(key);

    if (value === null) {
      return null;
    }

    const branchId = Number(value);

    if (
      !Number.isSafeInteger(branchId) ||
      branchId <= 0
    ) {
      sessionStorage.removeItem(key);
      return null;
    }

    return branchId;
  }

  private saveBranchId(
    companyId: number,
    branchId: number
  ): void {

    const key = this.getStorageKey(companyId);

    if (!key) {
      return;
    }

    sessionStorage.setItem(
      key,
      String(branchId)
    );
  }

  private removeSavedBranchId(
    companyId: number
  ): void {

    const key = this.getStorageKey(companyId);

    if (!key) {
      return;
    }

    sessionStorage.removeItem(key);
  }

  // =========================================================
  // User-scoped Persistence Cleanup
  // =========================================================

  /**
   * Removes saved branch selections belonging to
   * the currently authenticated user.
   *
   * Must be called before TokenService.clear().
   */
  clearPersistedSelection(): void {

    const userId =
      this.tokenService.getUser()?.userId;

    if (!userId) {
      return;
    }

    const prefix =
      `${this.storagePrefix}:${userId}:`;

    const keysToRemove: string[] = [];

    for (
      let index = 0;
      index < sessionStorage.length;
      index++
    ) {

      const key = sessionStorage.key(index);

      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  }

  // =========================================================
  // Workspace Reset
  // =========================================================

  /**
   * Clears in-memory workspace and initialization
   * state only.
   *
   * Persisted branch preferences are preserved.
   */
  clear(): void {

    this.branchOptionsState.set([]);

    this.workspaceState.set({
      ...INITIAL_WORKSPACE_CONTEXT
    });

    this.initializationState.set('idle');
  }
}