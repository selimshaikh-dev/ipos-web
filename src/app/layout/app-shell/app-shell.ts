import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet
} from '@angular/router';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { filter } from 'rxjs';

import { Sidebar } from '../sidebar/sidebar';
import { Header } from '../header/header';
import { Footer } from '../footer/footer';

import { NotificationContainer } from '../../shared/components/notification-container/notification-container';

import { AuthService } from '../../core/auth/services/auth.service';

import { WorkspaceContextService } from '../../core/workspace/services/workspace-context.service';

import { WorkspaceOptionsService } from '../../core/workspace/services/workspace-options.service';
import type { WorkspaceCompanyOption } from '../../core/workspace/models/workspace-options.model';

import type { WorkspaceRouteScope } from '../../app.routes';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    Sidebar,
    Header,
    Footer,
    NotificationContainer
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss'
})
export class AppShell {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly destroyRef = inject(DestroyRef);

  private readonly authService =
    inject(AuthService);

  private readonly router =
    inject(Router);

  private readonly activatedRoute =
    inject(ActivatedRoute);

  readonly workspaceContext =
    inject(WorkspaceContextService);

  private readonly workspaceOptions =
    inject(WorkspaceOptionsService);

  // =========================================================
  // Route Workspace Scope
  // =========================================================

  private readonly routeScopeState =
    signal<WorkspaceRouteScope>('company');

  readonly routeScope =
    this.routeScopeState.asReadonly();

  readonly isSuperAdmin = computed(() => {
    this.authService.sessionGenerationSignal();
    return this.authService.getCurrentUser()?.roles?.some(
      role => role.toLowerCase() === 'superadmin'
    ) ?? false;
  });

  readonly isPlatformRoute = computed(() => this.routeScope() === 'platform');

  readonly isBranchScopedRoute = computed(
    () => this.routeScope() === 'branch'
  );

  // =========================================================
  // Shared Workspace Initialization State
  // =========================================================

  private readonly availableCompaniesState = signal<readonly WorkspaceCompanyOption[]>([]);

  readonly availableCompanies = this.availableCompaniesState.asReadonly();

  readonly requiresCompanySelection = computed(() =>
    !this.isPlatformRoute() && this.availableCompanies().length > 1 && !this.workspaceContext.hasCompany()
  );

  readonly initializationStatus =
    this.workspaceContext.initializationStatus;

  readonly isWorkspaceLoading =
    this.workspaceContext.isInitializing;

  readonly hasWorkspaceError =
    this.workspaceContext.hasInitializationError;

  readonly canAccessCompanyRoutes =
    this.workspaceContext.canAccessCompanyRoutes;

  readonly canAccessBranchRoutes =
    this.workspaceContext.canAccessBranchRoutes;

  // =========================================================
  // Route-aware Workspace Access
  // =========================================================

  /**
   * Determines whether the active route has its
   * required workspace context.
   *
   * This controls UI visibility only.
   * It is not a security authorization mechanism.
   */
  readonly canAccessCurrentRoute = computed(() => {

    if (this.isPlatformRoute()) {
      return this.isSuperAdmin() && !this.isWorkspaceLoading();
    }
    if (this.isBranchScopedRoute()) {
      return this.canAccessBranchRoutes();
    }

    return this.canAccessCompanyRoutes();
  });

  /**
   * Branch selection is required only when the
   * current route is branch-scoped and no authorized
   * branch has been selected.
   */
  readonly requiresBranchSelection = computed(() =>
    this.isBranchScopedRoute() &&
    this.workspaceContext.isInitialized() &&
    this.workspaceContext.hasCompany() &&
    !this.workspaceContext.hasBranch()
  );

  /**
   * Compatibility with the existing app-shell.html.
   */
  readonly isWorkspaceReady =
    this.canAccessCurrentRoute;

  /**
   * Effective workspace status for UI display.
   */
  readonly workspaceStatus = computed(() => {

    if (this.isWorkspaceLoading()) {
      return 'loading' as const;
    }

    if (this.hasWorkspaceError() && !this.isPlatformRoute()) {
      return 'error' as const;
    }

    if (this.requiresBranchSelection()) {
      return 'selection-required' as const;
    }

    if (this.canAccessCurrentRoute()) {
      return 'ready' as const;
    }

    return 'idle' as const;
  });

  // =========================================================
  // Initialization
  // =========================================================

  constructor() {

    this.initializeRouteTracking();

    this.initializeWorkspace();
  }

  // =========================================================
  // Route Scope Tracking
  // =========================================================

  private initializeRouteTracking(): void {

    // Initial navigation may still be in progress.
    // Resolve whatever route information is currently
    // available without assuming snapshot exists.

    this.updateRouteScope();

    // Update scope after each completed navigation.

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd =>
            event instanceof NavigationEnd
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.updateRouteScope();
      });
  }

  private updateRouteScope(): void {

    // Begin with the current activated route.

    let route: ActivatedRoute | null =
      this.activatedRoute;

    // Traverse to the deepest activated child.

    while (route?.firstChild) {
      route = route.firstChild;
    }

    // During initial navigation, route snapshot
    // may not yet be available.
    //
    // Optional chaining prevents an application
    // crash while the route tree is initializing.

    const configuredScope: unknown =
      route?.snapshot?.data?.['workspaceScope'];

    // Existing routes default to company scope.
    //
    // Branch-specific routes must explicitly
    // declare workspaceScope: 'branch'.

    const scope: WorkspaceRouteScope =
      configuredScope === 'platform' ? 'platform' :
      configuredScope === 'branch' ? 'branch' : 'company';

    this.routeScopeState.set(scope);
  }

  // =========================================================
  // Workspace Initialization
  // =========================================================

  private initializeWorkspace(): void {

    // Reset in-memory workspace context.
    //
    // Saved branch preferences are retained for
    // server-authorized restoration.

    this.workspaceContext.clear();
    this.availableCompaniesState.set([]);

    // Publish loading state.

    this.workspaceContext.beginInitialization();

    // Capture the authentication lifecycle that
    // owns this workspace initialization request.

    const requestedUserId =
      this.authService.getCurrentUser()?.userId;

    const requestedGeneration =
      this.authService.getSessionGeneration();

    // Authentication identity must exist.

    if (!requestedUserId) {
      this.workspaceContext.failInitialization();
      return;
    }

    // Load server-authorized workspace options.

    this.workspaceOptions
      .getOptions()
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

        next: response => {

          // Reject responses belonging to an
          // obsolete authentication lifecycle.

          if (
            !this.isCurrentSession(
              requestedUserId,
              requestedGeneration
            )
          ) {
            return;
          }

          const companies = response.companies ?? [];
          this.availableCompaniesState.set(companies);

          if (this.isSuperAdmin()) {
            // Platform access does not depend on company/branch selection.
            // Keep the options for explicit company selection later.
            this.workspaceContext.clear();
            if (this.router.url === '/dashboard' && !this.workspaceContext.hasCompany()) {
              void this.router.navigateByUrl('/platform');
            }
            return;
          }

          if (companies.length === 0) {
            this.workspaceContext.failInitialization();
            return;
          }

          if (companies.length > 1) {
            // No implicit cross-company selection. The user chooses.
            this.workspaceContext.clear();
            return;
          }

          const company = companies[0];

          // Company-scoped routes do not require a branch.
          // configureCompany() accepts zero authorized branches;
          // branch-scoped routes remain protected by route scope.

          // Configure the authorized company and
          // branches.
          //
          // configureCompany() updates the shared
          // initialization status to 'ready'.

          this.workspaceContext.configureCompany(
            company
          );
        },

        error: () => {

          // Ignore errors from outdated sessions.

          if (
            !this.isCurrentSession(
              requestedUserId,
              requestedGeneration
            )
          ) {
            return;
          }

          this.workspaceContext.failInitialization();
        }
      });
  }

  // =========================================================
  // Explicit, server-authorized Company Selection
  // =========================================================

  selectCompany(companyId: number): void {
    const company = this.availableCompanies().find(option => option.id === companyId);
    if (!company || !this.authService.isAuthenticated()) {
      return;
    }

    this.workspaceContext.configureCompany(company);
  }

  // =========================================================
  // Authentication Session Validation
  // =========================================================

  private isCurrentSession(
    requestedUserId: string,
    requestedGeneration: number
  ): boolean {

    const currentUserId =
      this.authService.getCurrentUser()?.userId;

    const currentGeneration =
      this.authService.getSessionGeneration();

    return (
      this.authService.isAuthenticated() &&
      currentUserId === requestedUserId &&
      currentGeneration === requestedGeneration
    );
  }
}