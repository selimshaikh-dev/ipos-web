
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

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import {
  filter
} from 'rxjs';

import { Sidebar } from '../sidebar/sidebar';
import { Header } from '../header/header';
import { Footer } from '../footer/footer';

import {
  NotificationContainer
} from '../../shared/components/notification-container/notification-container';

import {
  AuthService
} from '../../core/auth/services/auth.service';

import {
  WorkspaceContextService
} from '../../core/workspace/services/workspace-context.service';

import {
  WorkspaceOptionsService
} from '../../core/workspace/services/workspace-options.service';

import type {
  WorkspaceCompanyOption
} from '../../core/workspace/models/workspace-options.model';

import type {
  WorkspaceRouteScope
} from '../../app.routes';

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

    return this.authService
      .getCurrentUser()
      ?.roles
      ?.some(
        role =>
          role.toLowerCase() === 'superadmin'
      ) ?? false;

  });

  readonly isPlatformRoute = computed(
    () => this.routeScope() === 'platform'
  );

  readonly isBranchScopedRoute = computed(
    () => this.routeScope() === 'branch'
  );

  // =========================================================
  // Authorized Company Options
  // =========================================================

  private readonly availableCompaniesState =
    signal<readonly WorkspaceCompanyOption[]>([]);

  readonly availableCompanies =
    this.availableCompaniesState.asReadonly();

  readonly requiresCompanySelection = computed(() => {

    if (this.isPlatformRoute()) {
      return false;
    }

    return (
      this.availableCompanies().length > 1 &&
      !this.workspaceContext.hasCompany()
    );

  });

  // =========================================================
  // Workspace Initialization State
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
   * Determines whether the current route has its
   * required workspace context.
   *
   * This is a UI visibility decision only.
   *
   * Backend authorization must independently enforce
   * company, branch and permission access.
   */
  readonly canAccessCurrentRoute = computed(() => {

    if (this.isPlatformRoute()) {

      return (
        this.isSuperAdmin() &&
        !this.isWorkspaceLoading()
      );

    }

    if (this.isBranchScopedRoute()) {

      return this.canAccessBranchRoutes();

    }

    return this.canAccessCompanyRoutes();

  });

  // =========================================================
  // Branch Selection Requirement
  // =========================================================

  /**
   * Company-level routes never require a branch.
   *
   * Branch selection is required only for routes
   * explicitly configured with workspaceScope:
   * 'branch'.
   */
  readonly requiresBranchSelection = computed(() => {

    return (
      this.isBranchScopedRoute() &&
      this.workspaceContext.isInitialized() &&
      this.workspaceContext.hasCompany() &&
      !this.workspaceContext.hasBranch()
    );

  });

  // =========================================================
  // Existing Template Compatibility
  // =========================================================

  readonly isWorkspaceReady =
    this.canAccessCurrentRoute;

  readonly workspaceStatus = computed(() => {

    if (this.isWorkspaceLoading()) {
      return 'loading' as const;
    }

    if (
      this.hasWorkspaceError() &&
      !this.isPlatformRoute()
    ) {
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
  // Constructor
  // =========================================================

  constructor() {

    this.initializeRouteTracking();

    this.initializeWorkspace();

  }

  // =========================================================
  // Route Scope Tracking
  // =========================================================

  private initializeRouteTracking(): void {

    this.updateRouteScope();

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

    let route: ActivatedRoute | null =
      this.activatedRoute;

    while (route?.firstChild) {
      route = route.firstChild;
    }

    const configuredScope: unknown =
      route?.snapshot?.data?.['workspaceScope'];

    const scope: WorkspaceRouteScope =
      configuredScope === 'platform'
        ? 'platform'
        : configuredScope === 'branch'
          ? 'branch'
          : 'company';

    this.routeScopeState.set(scope);

  }

  // =========================================================
  // Workspace Initialization
  // =========================================================

  private initializeWorkspace(): void {

    // Reset in-memory context before loading the
    // server-authorized workspace options.

    this.workspaceContext.clear();

    this.availableCompaniesState.set([]);

    this.workspaceContext.beginInitialization();

    // Capture the authentication lifecycle that owns
    // this initialization request.

    const requestedUserId =
      this.authService.getCurrentUser()?.userId;

    const requestedGeneration =
      this.authService.getSessionGeneration();

    if (!requestedUserId) {

      this.workspaceContext.failInitialization();

      return;

    }

    this.workspaceOptions
      .getOptions()
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

        next: response => {

          // Reject responses from obsolete sessions.

          if (
            !this.isCurrentSession(
              requestedUserId,
              requestedGeneration
            )
          ) {
            return;
          }

          const companies =
            response.companies ?? [];

          this.availableCompaniesState.set(companies);

          // =============================================
          // Super Admin Workspace Initialization
          // =============================================

          if (this.isSuperAdmin()) {

            /*
             * Super Admin can access Platform
             * Administration without a company.
             *
             * However, an explicitly selected
             * company must not be discarded.
             */

            const selectedCompanyId =
              this.workspaceContext.companyId();

            if (selectedCompanyId !== null) {

              const authorizedCompany =
                companies.find(
                  company =>
                    company.id === selectedCompanyId
                );

              if (authorizedCompany) {

                this.workspaceContext.configureCompany(
                  authorizedCompany,
                  this.workspaceContext.branchId()
                );

                return;

              }

            }

            /*
             * No currently authorized company
             * is selected.
             *
             * Preserve Platform access without
             * assigning a company implicitly.
             */

            this.workspaceContext.clear();

            if (this.router.url === '/dashboard') {

              void this.router.navigateByUrl(
                '/platform'
              );

            }

            return;

          }

          // =============================================
          // Standard User: No Authorized Companies
          // =============================================

          if (companies.length === 0) {

            this.workspaceContext.failInitialization();

            return;

          }

          // =============================================
          // Standard User: Multiple Companies
          // =============================================

          if (companies.length > 1) {

            /*
             * Never implicitly choose a company
             * when multiple authorized companies
             * are available.
             *
             * The AppShell company selection UI
             * handles explicit selection.
             */

            this.workspaceContext.clear();

            return;

          }

          // =============================================
          // Standard User: Single Company
          // =============================================

          const company = companies[0];

          /*
           * A company-scoped route does not
           * require branch selection.
           *
           * configureCompany() validates saved
           * branch preferences against the
           * authorized branch options.
           */

          this.workspaceContext.configureCompany(
            company
          );

        },

        error: () => {

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
  // Explicit Company Selection
  // =========================================================

  /**
   * Selects a company returned by the authenticated
   * workspace/options API.
   *
   * A company selection changes the active context.
   * It does not grant additional permissions.
   */
  selectCompany(companyId: number): void {

    if (
      !Number.isSafeInteger(companyId) ||
      companyId <= 0
    ) {
      return;
    }

    if (!this.authService.isAuthenticated()) {
      return;
    }

    const company = this.availableCompanies()
      .find(
        option => option.id === companyId
      );

    if (!company) {
      return;
    }

    this.workspaceContext.configureCompany(
      company
    );

  }

  // =========================================================
  // Authentication Session Validation
  // =========================================================

  /**
   * Ensures that an asynchronous workspace response
   * belongs to the current authenticated user and
   * authentication lifecycle.
   */
  private isCurrentSession(
    requestedUserId: string,
    requestedGeneration: number
  ): boolean {

    const currentUserId =
      this.authService
        .getCurrentUser()
        ?.userId;

    const currentGeneration =
      this.authService
        .getSessionGeneration();

    return (
      this.authService.isAuthenticated() &&
      currentUserId === requestedUserId &&
      currentGeneration === requestedGeneration
    );

  }

}