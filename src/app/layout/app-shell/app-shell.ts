
import {
  Component,
  DestroyRef,
  computed,
  effect,
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

  private readonly destroyRef =
    inject(DestroyRef);

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

  readonly requiresBranchSelection = computed(() => {

    return (
      this.isBranchScopedRoute() &&
      this.workspaceContext.isInitialized() &&
      this.workspaceContext.hasCompany() &&
      !this.workspaceContext.hasBranch()
    );

  });

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

  constructor() {

    this.initializeRouteTracking();

    this.initializeWorkspace();

    effect(() => {

      const status =
        this.workspaceContext.initializationStatus();

      const companyId =
        this.workspaceContext.companyId();

      const isSuperAdmin =
        this.isSuperAdmin();

      if (
        this.router.url !== '/workspace' ||
        !this.authService.isAuthenticated()
      ) {
        return;
      }

      if (
        status === 'ready' &&
        companyId !== null
      ) {

        void this.router.navigateByUrl(
          '/dashboard',
          { replaceUrl: true }
        );

      } else if (
        status === 'idle' &&
        isSuperAdmin &&
        companyId === null
      ) {

        void this.router.navigateByUrl(
          '/platform',
          { replaceUrl: true }
        );

      }

    });

  }

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

  private initializeWorkspace(): void {

    this.workspaceContext.clear();

    this.availableCompaniesState.set([]);

    this.workspaceContext.beginInitialization();

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

          if (this.isSuperAdmin()) {

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

            this.workspaceContext.clear();

            if (this.router.url === '/dashboard') {

              void this.router.navigateByUrl(
                '/platform'
              );

            }

            return;

          }

          if (companies.length === 0) {

            this.workspaceContext.failInitialization();

            return;

          }

          if (companies.length > 1) {

            this.workspaceContext.clear();

            return;

          }

          const company = companies[0];

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