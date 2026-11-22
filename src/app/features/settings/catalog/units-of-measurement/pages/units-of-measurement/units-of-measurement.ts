
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

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { finalize, Subscription } from 'rxjs';

import {
  ChangeUnitOfMeasureStatusRequest,
  CreateUnitOfMeasureRequest,
  UnitOfMeasure,
  UnitOfMeasureListQuery,
  UnitOfMeasurePagedResult,
  UpdateUnitOfMeasureRequest
} from '../../models/unit-of-measurement.model';

import { UnitOfMeasureService } from '../../services/unit-of-measurement.service';

import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';
import { EffectivePermissionService } from '../../../../../../core/authorization/effective-permission.service';
import { PermissionCodes } from '../../../../../../core/authorization/permission-registry';

type UnitActiveView = 'directory' | 'details';
type UnitSortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-units-of-measurement',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './units-of-measurement.html',
  styleUrl: './units-of-measurement.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UnitsOfMeasurement {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);
  private readonly unitService = inject(UnitOfMeasureService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly permissionService = inject(EffectivePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // Workspace Context
  // =========================================================

  // Workspace selection is not an authorization boundary.
  // Backend authorization remains authoritative.

  readonly companyId = this.workspaceContext.companyId;

  // =========================================================
  // Permissions
  // =========================================================

  readonly canView = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.unitsOfMeasurement.view
    )
  );

  readonly canCreate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.unitsOfMeasurement.create
    )
  );

  readonly canUpdate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.unitsOfMeasurement.update
    )
  );

  readonly canActivate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.unitsOfMeasurement.activate
    )
  );

  readonly canDeactivate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.unitsOfMeasurement.deactivate
    )
  );

  // =========================================================
  // Page State
  // =========================================================

  readonly activeView = signal<UnitActiveView>('directory');

  // =========================================================
  // Create State
  // =========================================================

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly lastCreatedUnit = signal<UnitOfMeasure | null>(null);

  // =========================================================
  // Details / Edit State
  // =========================================================

  readonly selectedUnit = signal<UnitOfMeasure | null>(null);
  readonly isLoadingUnitDetails = signal(false);
  readonly unitDetailsError = signal<string | null>(null);

  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);

  // =========================================================
  // Activate / Deactivate State
  // =========================================================

  readonly isChangingStatus = signal(false);
  readonly statusError = signal<string | null>(null);

  // =========================================================
  // Directory State
  // =========================================================

  readonly units = signal<UnitOfMeasure[]>([]);
  readonly isLoadingUnits = signal(false);
  readonly directoryError = signal<string | null>(null);

  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);

  readonly hasPreviousPage = signal(false);
  readonly hasNextPage = signal(false);

  // =========================================================
  // Directory Filters
  // =========================================================

  readonly searchCode = signal('');
  readonly searchName = signal('');
  readonly searchSymbol = signal('');

  readonly selectedIsActive = signal<boolean | null>(null);
  readonly includeInactive = signal(false);

  readonly sortBy = signal('name');
  readonly sortDirection = signal<UnitSortDirection>('asc');

  // =========================================================
  // Request Subscriptions
  // =========================================================

  private directorySubscription: Subscription | null = null;
  private detailsSubscription: Subscription | null = null;
  private createSubscription: Subscription | null = null;
  private updateSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;

  // =========================================================
  // Request Versions
  // =========================================================

  private directoryRequestVersion = 0;
  private detailsRequestVersion = 0;
  private createRequestVersion = 0;
  private updateRequestVersion = 0;
  private statusRequestVersion = 0;

  // =========================================================
  // Forms
  // =========================================================

  readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [
      Validators.required,
      Validators.maxLength(200)
    ]],
    symbol: ['', [
      Validators.required,
      Validators.maxLength(20)
    ]]
  });

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [
      Validators.required,
      Validators.maxLength(200)
    ]],
    symbol: ['', [
      Validators.required,
      Validators.maxLength(20)
    ]]
  });

  // =========================================================
  // Lifecycle
  // =========================================================

  constructor() {

    effect(() => {
      const companyId = this.companyId();
      const canView = this.canView();

      untracked(() => {
        this.resetForCompanyChange();

        if (
          companyId !== null &&
          Number.isSafeInteger(companyId) &&
          companyId > 0 &&
          canView
        ) {
          this.loadUnits();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelDetailsRequest();
      this.cancelCreateRequest();
      this.cancelUpdateRequest();
      this.cancelStatusRequest();
    });
  }

  // =========================================================
  // Navigation
  // =========================================================

  showDirectory(): void {

    if (
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    this.closeEditUnit();
    this.cancelDetailsRequest();

    this.isLoadingUnitDetails.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {

    if (
      this.selectedUnit() === null ||
      this.isCreating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    this.activeView.set('details');
  }

  // =========================================================
  // Directory Loading
  // =========================================================

  loadUnits(): void {

    const companyId = this.companyId();

    this.cancelDirectoryRequest();

    const requestVersion = this.directoryRequestVersion;

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      !this.canView()
    ) {
      this.clearDirectory();
      this.isLoadingUnits.set(false);
      this.directoryError.set(null);
      return;
    }

    const query: UnitOfMeasureListQuery = {
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,
      symbol: this.searchSymbol().trim() || undefined,
      isActive: this.selectedIsActive() ?? undefined,
      includeInactive: this.includeInactive(),
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingUnits.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.unitService
      .getUnitsOfMeasurement(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.directoryRequestVersion
          ) {
            this.isLoadingUnits.set(false);
          }
        })
      )
      .subscribe({
        next: (result: UnitOfMeasurePagedResult) => {

          if (
            requestVersion !== this.directoryRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.units.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPages.set(result.totalPages);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
          this.hasPreviousPage.set(result.hasPreviousPage);
          this.hasNextPage.set(result.hasNextPage);
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.directoryRequestVersion ||
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

  refreshDirectory(): void {
    this.loadUnits();
  }

  // =========================================================
  // Directory Search
  // =========================================================

  searchUnits(
    code: string,
    name: string,
    symbol: string
  ): void {

    this.searchCode.set(code.trim());
    this.searchName.set(name.trim());
    this.searchSymbol.set(symbol.trim());

    this.pageNumber.set(1);
    this.loadUnits();
  }

  clearSearch(): void {

    this.searchCode.set('');
    this.searchName.set('');
    this.searchSymbol.set('');

    this.pageNumber.set(1);
    this.loadUnits();
  }

  // =========================================================
  // Directory Filters
  // =========================================================

  filterByStatus(isActive: boolean | null): void {

    this.selectedIsActive.set(isActive);

    if (isActive === false) {
      this.includeInactive.set(true);
    }

    this.pageNumber.set(1);
    this.loadUnits();
  }

  setIncludeInactive(includeInactive: boolean): void {

    this.includeInactive.set(includeInactive);

    if (
      !includeInactive &&
      this.selectedIsActive() === false
    ) {
      this.selectedIsActive.set(null);
    }

    this.pageNumber.set(1);
    this.loadUnits();
  }

  clearFilters(): void {

    this.searchCode.set('');
    this.searchName.set('');
    this.searchSymbol.set('');

    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.loadUnits();
  }

  // =========================================================
  // Sorting
  // =========================================================

  changeSorting(
    sortBy: string,
    direction: UnitSortDirection
  ): void {

    this.sortBy.set(sortBy);
    this.sortDirection.set(direction);

    this.pageNumber.set(1);
    this.loadUnits();
  }

  // =========================================================
  // Pagination
  // =========================================================

  previousPage(): void {

    if (
      this.isLoadingUnits() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(page =>
      Math.max(1, page - 1)
    );

    this.loadUnits();
  }

  nextPage(): void {

    if (
      this.isLoadingUnits() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(page => page + 1);

    this.loadUnits();
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

    this.loadUnits();
  }

  // =========================================================
  // Unit Details
  // =========================================================

  viewUnit(unitId: number): void {

    if (
      this.isChangingStatus() ||
      this.isUpdating()
    ) {
      return;
    }

    const companyId = this.companyId();

    this.cancelDetailsRequest();

    const requestVersion = this.detailsRequestVersion;

    this.closeEditUnit();

    this.selectedUnit.set(null);
    this.lastCreatedUnit.set(null);
    this.unitDetailsError.set(null);
    this.statusError.set(null);
    this.isLoadingUnitDetails.set(false);

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      !Number.isSafeInteger(unitId) ||
      unitId <= 0 ||
      !this.canView()
    ) {
      this.unitDetailsError.set(
        'Select a valid company and unit of measurement.'
      );

      this.activeView.set('details');
      return;
    }

    this.isCreateOpen.set(false);
    this.activeView.set('details');
    this.isLoadingUnitDetails.set(true);

    this.detailsSubscription = this.unitService
      .getUnitOfMeasureById(companyId, unitId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.detailsRequestVersion
          ) {
            this.isLoadingUnitDetails.set(false);
          }
        })
      )
      .subscribe({
        next: unit => {

          if (
            requestVersion !== this.detailsRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedUnit.set(unit);
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.detailsRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.unitDetailsError.set(
            this.getDetailsErrorMessage(error)
          );
        }
      });
  }

  refreshUnitDetails(): void {

    if (
      this.isChangingStatus() ||
      this.isUpdating()
    ) {
      return;
    }

    const unit = this.selectedUnit();

    if (unit) {
      this.viewUnit(unit.id);
    }
  }

  // =========================================================
  // Create Unit
  // =========================================================

  openCreateUnit(): void {

    if (
      !this.canCreate() ||
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0
    ) {
      this.notificationService.error(
        'Select a company before creating a unit.',
        { title: 'Company selection required' }
      );
      return;
    }

    this.createForm.reset({
      name: '',
      symbol: ''
    });

    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }

  cancelCreateUnit(): void {

    if (this.isCreating()) {
      return;
    }

    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  createUnit(): void {

    if (
      !this.isCreateOpen() ||
      this.isCreating() ||
      this.isChangingStatus() ||
      !this.canCreate()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0
    ) {
      this.createError.set(
        'Select a valid company before creating a unit.'
      );
      return;
    }

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();

    const name = value.name.trim();
    const symbol = value.symbol.trim();

    if (!name || !symbol) {
      this.createForm.markAllAsTouched();
      this.createError.set(
        'Name and symbol are required.'
      );
      return;
    }

    // The backend generates the unit code.
    // The current API request contract includes "code".

    const request: CreateUnitOfMeasureRequest = {
      code: '',
      name,
      symbol
    };

    this.cancelCreateRequest();

    const requestVersion = this.createRequestVersion;

    this.createError.set(null);
    this.isCreating.set(true);

    this.createSubscription = this.unitService
      .createUnitOfMeasure(companyId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.createRequestVersion
          ) {
            this.isCreating.set(false);
          }
        })
      )
      .subscribe({
        next: unit => {

          if (
            requestVersion !== this.createRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.cancelDetailsRequest();

          this.selectedUnit.set(unit);
          this.lastCreatedUnit.set(unit);
          this.unitDetailsError.set(null);
          this.isLoadingUnitDetails.set(false);

          this.isCreateOpen.set(false);
          this.createForm.reset();

          this.notificationService.success(
            `Unit ${unit.code} created successfully.`,
            { title: 'Unit created' }
          );

          this.pageNumber.set(1);
          this.loadUnits();

          this.activeView.set('details');
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.createRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message =
            this.getCreateErrorMessage(error);

          this.createError.set(message);

          this.notificationService.error(
            message,
            { title: 'Unit creation failed' }
          );
        }
      });
  }

  // =========================================================
  // Edit Unit
  // =========================================================

  openEditUnit(): void {

    const unit = this.selectedUnit();

    if (
      !unit ||
      !this.canUpdate() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      this.isLoadingUnitDetails() ||
      this.companyId() !== unit.companyId
    ) {
      return;
    }

    this.editForm.reset({
      name: unit.name,
      symbol: unit.symbol
    });

    this.updateError.set(null);
    this.isEditOpen.set(true);
  }

  closeEditUnit(): void {

    if (this.isUpdating()) {
      return;
    }

    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();
  }

  updateUnit(): void {

    if (
      !this.isEditOpen() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      !this.canUpdate()
    ) {
      return;
    }

    const unit = this.selectedUnit();
    const companyId = this.companyId();

    if (
      !unit ||
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      unit.companyId !== companyId ||
      !unit.rowVersion
    ) {
      this.updateError.set(
        'Unit details are unavailable. Reload and try again.'
      );
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();

    const name = value.name.trim();
    const symbol = value.symbol.trim();

    if (!name || !symbol) {
      this.editForm.markAllAsTouched();
      this.updateError.set(
        'Name and symbol are required.'
      );
      return;
    }

    const request: UpdateUnitOfMeasureRequest = {
      name,
      symbol,
      rowVersion: unit.rowVersion
    };

    this.cancelUpdateRequest();

    const requestVersion = this.updateRequestVersion;

    this.updateError.set(null);
    this.isUpdating.set(true);

    this.updateSubscription = this.unitService
      .updateUnitOfMeasure(companyId, unit.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.updateRequestVersion
          ) {
            this.isUpdating.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {

          if (
            requestVersion !== this.updateRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedUnit.set(updated);
          this.lastCreatedUnit.set(updated);

          this.units.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.isEditOpen.set(false);
          this.editForm.reset();

          this.notificationService.success(
            `Unit ${updated.code} updated successfully.`,
            { title: 'Unit updated' }
          );

          this.loadUnits();
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.updateRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message =
            this.getUpdateErrorMessage(error);

          this.updateError.set(message);

          this.notificationService.error(
            message,
            { title: 'Unit update failed' }
          );
        }
      });
  }

  // =========================================================
  // Activate / Deactivate Unit
  // =========================================================

  changeUnitStatus(isActive: boolean): void {

    const unit = this.selectedUnit();
    const companyId = this.companyId();

    if (
      !unit ||
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      unit.companyId !== companyId ||
      !unit.rowVersion ||
      unit.isActive === isActive ||
      !this.canView() ||
      this.isChangingStatus() ||
      this.isUpdating() ||
      this.isEditOpen() ||
      this.isCreating() ||
      this.isLoadingUnitDetails() ||
      !(isActive ? this.canActivate() : this.canDeactivate())
    ) {
      return;
    }

    const request: ChangeUnitOfMeasureStatusRequest = {
      rowVersion: unit.rowVersion
    };

    this.cancelStatusRequest();

    const requestVersion = this.statusRequestVersion;

    this.statusError.set(null);
    this.isChangingStatus.set(true);

    const operation = isActive
      ? this.unitService.activateUnitOfMeasure(
          companyId,
          unit.id,
          request
        )
      : this.unitService.deactivateUnitOfMeasure(
          companyId,
          unit.id,
          request
        );

    this.statusSubscription = operation
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.statusRequestVersion
          ) {
            this.isChangingStatus.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {

          if (
            requestVersion !== this.statusRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedUnit.set(updated);

          this.units.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.notificationService.success(
            `Unit ${updated.code} ${
              isActive ? 'activated' : 'deactivated'
            } successfully.`,
            { title: 'Unit status updated' }
          );

          this.loadUnits();
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.statusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message =
            this.getStatusErrorMessage(error);

          this.statusError.set(message);

          this.notificationService.error(
            message,
            { title: 'Unit status change failed' }
          );
        }
      });
  }

  // =========================================================
  // Workspace Reset
  // =========================================================

  private resetForCompanyChange(): void {

    this.cancelDirectoryRequest();
    this.cancelDetailsRequest();
    this.cancelCreateRequest();
    this.cancelUpdateRequest();
    this.cancelStatusRequest();

    this.isChangingStatus.set(false);
    this.statusError.set(null);

    this.isCreating.set(false);
    this.isUpdating.set(false);

    this.isCreateOpen.set(false);
    this.isEditOpen.set(false);

    this.createError.set(null);
    this.updateError.set(null);

    this.createForm.reset();
    this.editForm.reset();

    this.selectedUnit.set(null);
    this.lastCreatedUnit.set(null);

    this.unitDetailsError.set(null);
    this.isLoadingUnitDetails.set(false);

    this.searchCode.set('');
    this.searchName.set('');
    this.searchSymbol.set('');

    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();

    this.directoryError.set(null);
    this.isLoadingUnits.set(false);

    this.activeView.set('directory');
  }

  private clearDirectory(): void {

    this.units.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
    this.hasPreviousPage.set(false);
    this.hasNextPage.set(false);
  }

  // =========================================================
  // Request Cancellation
  // =========================================================

  private cancelDirectoryRequest(): void {

    ++this.directoryRequestVersion;

    this.directorySubscription?.unsubscribe();
    this.directorySubscription = null;
  }

  private cancelDetailsRequest(): void {

    ++this.detailsRequestVersion;

    this.detailsSubscription?.unsubscribe();
    this.detailsSubscription = null;
  }

  private cancelCreateRequest(): void {

    ++this.createRequestVersion;

    this.createSubscription?.unsubscribe();
    this.createSubscription = null;
  }

  private cancelUpdateRequest(): void {

    ++this.updateRequestVersion;

    this.updateSubscription?.unsubscribe();
    this.updateSubscription = null;
  }

  private cancelStatusRequest(): void {

    ++this.statusRequestVersion;

    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
  }

  // =========================================================
  // Error Handling
  // =========================================================

  private getDirectoryErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid unit search or filter parameters.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view units of measurement.';
    }

    if (error.status === 404) {
      return 'The selected company could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load units of measurement. Please try again.';
  }

  private getDetailsErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid unit or company identifier.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view this unit.';
    }

    if (error.status === 404) {
      return 'The requested unit of measurement was not found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load unit details. Please try again.';
  }

  private getCreateErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid unit details. Review the form and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to create units of measurement.';
    }

    if (error.status === 404) {
      return 'The selected company could not be found.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'A conflict occurred while creating the unit.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to create the unit. Please try again.';
  }

  private getUpdateErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid unit details. Review the form and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to update units of measurement.';
    }

    if (error.status === 404) {
      return 'The unit was not found. Return to the directory and refresh.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'This unit has changed. Reload its details before retrying.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to update the unit. Please try again.';
  }

  private getStatusErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid unit status request. Reload the unit and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to change this unit status.';
    }

    if (error.status === 404) {
      return 'The company or unit was not found. Refresh the directory.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'This unit was changed by another request. Refresh its details before retrying.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to change unit status. Please try again.';
  }
}