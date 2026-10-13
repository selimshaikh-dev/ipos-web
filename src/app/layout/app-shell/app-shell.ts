
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

  readonly isBranchScopedRoute = computed(
    () => this.routeScope() === 'branch'
  );

  // =========================================================
  // Shared Workspace Initialization State
  // =========================================================

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
  readonly requiresBranchSelection = computed(
    () =>
      this.isBranchScopedRoute() &&
      this.workspaceContext.requiresBranchSelection()
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

    if (this.hasWorkspaceError()) {
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
      configuredScope === 'branch'
        ? 'branch'
        : 'company';

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

          // iPOS currently supports a single
          // authorized company workspace.

          const companies = response.companies;

          if (companies.length !== 1) {
            this.workspaceContext.failInitialization();
            return;
          }

          const company = companies[0];

          // The current multi-branch workspace
          // requires at least one authorized branch.

          if (company.branches.length === 0) {
            this.workspaceContext.failInitialization();
            return;
          }

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