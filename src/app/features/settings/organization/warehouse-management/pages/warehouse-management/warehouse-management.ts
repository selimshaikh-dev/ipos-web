
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
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';

import {
  CreateWarehouseRequest,
  UpdateWarehouseRequest,
  Warehouse,
  WarehouseListQuery,
  WarehousePagedResult,
  WarehouseType,
  WAREHOUSE_TYPE_OPTIONS
} from '../../models/warehouse.model';

import { WarehouseService } from '../../services/warehouse.service';

import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';

type WarehouseActiveView = 'directory' | 'details';

type WarehouseSortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-warehouse-management',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './warehouse-management.html',
  styleUrl: './warehouse-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WarehouseManagement {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);
  private readonly warehouseService = inject(WarehouseService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // Workspace Context
  //
  // Client-side context is not an authorization mechanism.
  // Backend authorization remains mandatory.
  // =========================================================

  readonly branchId = this.workspaceContext.branchId;

  // =========================================================
  // Warehouse Type Options
  // =========================================================

  readonly warehouseTypes = WAREHOUSE_TYPE_OPTIONS;
  readonly WarehouseType = WarehouseType;

  // =========================================================
  // Page State
  // =========================================================

  readonly activeView = signal<WarehouseActiveView>('directory');

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly lastCreatedWarehouse = signal<Warehouse | null>(null);

  // Selected warehouse is independent of the last-created record.
  readonly selectedWarehouse = signal<Warehouse | null>(null);

  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);
  readonly isLoadingWarehouseDetails = signal(false);
  readonly warehouseDetailsError = signal<string | null>(null);

  // =========================================================
  // Directory State
  // =========================================================

  readonly warehouses = signal<Warehouse[]>([]);

  readonly isLoadingWarehouses = signal(false);

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

  readonly selectedWarehouseType =
    signal<WarehouseType | null>(null);

  readonly selectedIsActive = signal<boolean | null>(null);

  readonly includeInactive = signal(false);

  // =========================================================
  // Directory Sorting
  // =========================================================

  readonly sortBy = signal('name');

  readonly sortDirection =
    signal<WarehouseSortDirection>('asc');

  // =========================================================
  // Request Lifecycle
  // =========================================================

  private directorySubscription: Subscription | null = null;

  private directoryRequestVersion = 0;

  private detailsSubscription: Subscription | null = null;
  private detailsRequestVersion = 0;

  private updateSubscription: Subscription | null = null;
  private updateRequestVersion = 0;

  // =========================================================
  // Create Warehouse Form
  // =========================================================

  readonly createForm = this.formBuilder.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.maxLength(200)
      ]
    ],
    type: [
      WarehouseType.General,
      [Validators.required]
    ],
    isDefault: [false],
    allowSales: [false]
  });

  // =========================================================
  // Edit Warehouse Form
  // =========================================================

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    type: [WarehouseType.General, [Validators.required]],
    allowSales: [false]
  });

  // =========================================================
  // Constructor
  //
  // Automatically reload the directory when the active
  // workspace branch changes.
  // =========================================================

  constructor() {
    effect(() => {
      const branchId = this.branchId();

      untracked(() => {
        this.resetDirectoryForBranchChange();

        if (branchId !== null && branchId > 0) {
          this.loadWarehouses();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelDetailsRequest();
      this.cancelUpdateRequest();
    });
  }

  // =========================================================
  // Navigation
  // =========================================================

  showDirectory(): void {
    if (this.isCreating() || this.isUpdating()) {
      return;
    }

    this.closeEditWarehouse();
    this.cancelDetailsRequest();
    this.isLoadingWarehouseDetails.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {
    if (this.selectedWarehouse() === null &&
        this.lastCreatedWarehouse() === null) {
      return;
    }

    this.activeView.set('details');
  }

  // =========================================================
  // Get Warehouse By ID
  // =========================================================

  viewWarehouse(warehouseId: number): void {
    const branchId = this.branchId();

    this.cancelDetailsRequest();
    const requestVersion = ++this.detailsRequestVersion;

    this.closeEditWarehouse();
    this.selectedWarehouse.set(null);
    this.warehouseDetailsError.set(null);
    this.isLoadingWarehouseDetails.set(false);

    if (branchId === null || branchId <= 0 ||
        !Number.isSafeInteger(warehouseId) || warehouseId <= 0) {
      this.warehouseDetailsError.set('Select a valid warehouse and branch.');
      return;
    }

    // The existing template still renders lastCreatedWarehouse().
    // HTML binding will be switched to selectedWarehouse() next.
    this.lastCreatedWarehouse.set(null);
    this.isCreateOpen.set(false);
    this.activeView.set('details');
    this.isLoadingWarehouseDetails.set(true);

    this.detailsSubscription = this.warehouseService
      .getWarehouseById(branchId, warehouseId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.detailsRequestVersion) {
            this.isLoadingWarehouseDetails.set(false);
          }
        })
      )
      .subscribe({
        next: warehouse => {
          if (requestVersion !== this.detailsRequestVersion ||
              this.branchId() !== branchId) {
            return;
          }

          this.selectedWarehouse.set(warehouse);
          // Temporary compatibility with the current HTML details view.
          this.lastCreatedWarehouse.set(warehouse);
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.detailsRequestVersion ||
              this.branchId() !== branchId) {
            return;
          }

          this.warehouseDetailsError.set(
            this.getWarehouseDetailsErrorMessage(error)
          );
        }
      });
  }

  // =========================================================
  // Edit / Update Warehouse
  // =========================================================

  openEditWarehouse(): void {
    const warehouse = this.selectedWarehouse();
    if (!warehouse || this.isUpdating() || this.isLoadingWarehouseDetails() ||
        this.branchId() !== warehouse.branchId) {
      return;
    }

    this.editForm.reset({
      name: warehouse.name,
      type: warehouse.type,
      allowSales: warehouse.allowSales
    });
    this.updateError.set(null);
    this.isEditOpen.set(true);
  }

  closeEditWarehouse(): void {
    if (this.isUpdating()) {
      return;
    }
    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();
  }

  updateWarehouse(): void {
    if (!this.isEditOpen() || this.isUpdating()) {
      return;
    }

    const warehouse = this.selectedWarehouse();
    const branchId = this.branchId();
    if (!warehouse || branchId === null || branchId <= 0 ||
        warehouse.branchId !== branchId || !warehouse.rowVersion) {
      this.updateError.set('Warehouse details are unavailable. Reload the warehouse and try again.');
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();
    const name = value.name.trim();
    if (!name) {
      this.editForm.controls.name.markAsTouched();
      this.updateError.set('Warehouse name is required.');
      return;
    }

    const request: UpdateWarehouseRequest = {
      name,
      type: value.type,
      allowSales: value.allowSales,
      rowVersion: warehouse.rowVersion
    };

    this.cancelUpdateRequest();
    const requestVersion = ++this.updateRequestVersion;
    this.updateError.set(null);
    this.isUpdating.set(true);

    this.updateSubscription = this.warehouseService
      .updateWarehouse(branchId, warehouse.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.updateRequestVersion) {
            this.isUpdating.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {
          if (requestVersion !== this.updateRequestVersion ||
              this.branchId() !== branchId) {
            return;
          }

          this.selectedWarehouse.set(updated);
          this.lastCreatedWarehouse.set(updated);
          this.warehouses.update(items =>
            items.map(item => item.id === updated.id ? updated : item)
          );
          this.isEditOpen.set(false);
          this.editForm.reset();
          this.notificationService.success(
            `Warehouse ${updated.code} updated successfully.`,
            { title: 'Warehouse updated' }
          );
          this.loadWarehouses();
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.updateRequestVersion ||
              this.branchId() !== branchId) {
            return;
          }
          const message = this.getUpdateErrorMessage(error);
          this.updateError.set(message);
          this.notificationService.error(message, { title: 'Warehouse update failed' });
        }
      });
  }

  // =========================================================
  // Directory Loading
  // =========================================================

  loadWarehouses(): void {
    const branchId = this.branchId();

    this.cancelDirectoryRequest();

    const requestVersion = ++this.directoryRequestVersion;

    if (branchId === null || branchId <= 0) {
      this.clearDirectory();
      this.isLoadingWarehouses.set(false);
      this.directoryError.set(null);
      return;
    }

    const query: WarehouseListQuery = {
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,
      type: this.selectedWarehouseType() ?? undefined,
      isActive: this.selectedIsActive() ?? undefined,
      includeInactive: this.includeInactive(),
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingWarehouses.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.warehouseService
      .getWarehouses(branchId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.directoryRequestVersion) {
            this.isLoadingWarehouses.set(false);
          }
        })
      )
      .subscribe({
        next: (result: WarehousePagedResult) => {
          if (
            requestVersion !== this.directoryRequestVersion ||
            this.branchId() !== branchId
          ) {
            return;
          }

          this.warehouses.set(result.items);

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
            this.branchId() !== branchId
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
    this.loadWarehouses();
  }

  // =========================================================
  // Directory Search
  // =========================================================

  searchWarehouses(
    code: string,
    name: string
  ): void {
    this.searchCode.set(code.trim());
    this.searchName.set(name.trim());

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  clearSearch(): void {
    this.searchCode.set('');
    this.searchName.set('');

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  // =========================================================
  // Directory Filtering
  // =========================================================

  filterByType(
    type: WarehouseType | null
  ): void {
    this.selectedWarehouseType.set(type);

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  filterByStatus(
    isActive: boolean | null
  ): void {
    this.selectedIsActive.set(isActive);

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  setIncludeInactive(
    includeInactive: boolean
  ): void {
    this.includeInactive.set(includeInactive);

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  clearFilters(): void {
    this.searchCode.set('');
    this.searchName.set('');

    this.selectedWarehouseType.set(null);
    this.selectedIsActive.set(null);

    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  // =========================================================
  // Directory Sorting
  // =========================================================

  changeSorting(
    sortBy: string,
    direction: WarehouseSortDirection
  ): void {
    this.sortBy.set(sortBy);
    this.sortDirection.set(direction);

    this.pageNumber.set(1);

    this.loadWarehouses();
  }

  // =========================================================
  // Directory Pagination
  // =========================================================

  previousPage(): void {
    if (
      this.isLoadingWarehouses() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(page =>
      Math.max(1, page - 1)
    );

    this.loadWarehouses();
  }

  nextPage(): void {
    if (
      this.isLoadingWarehouses() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(page => page + 1);

    this.loadWarehouses();
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

    this.loadWarehouses();
  }

  // =========================================================
  // Create Panel
  // =========================================================

  openCreateWarehouse(): void {
    if (this.isCreating()) {
      return;
    }

    if (this.branchId() === null) {
      this.notificationService.error(
        'Select a branch before creating a warehouse.',
        { title: 'Branch selection required' }
      );
      return;
    }

    this.createForm.reset({
      name: '',
      type: WarehouseType.General,
      isDefault: false,
      allowSales: false
    });

    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }

  cancelCreateWarehouse(): void {
    if (this.isCreating()) {
      return;
    }

    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  // =========================================================
  // Create Warehouse
  // =========================================================

  createWarehouse(): void {
    if (!this.isCreateOpen() || this.isCreating()) {
      return;
    }

    const branchId = this.branchId();

    if (branchId === null || branchId <= 0) {
      this.createError.set(
        'Select a valid branch before creating a warehouse.'
      );
      return;
    }

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();

    const name = value.name.trim();

    if (!name) {
      this.createForm.controls.name.markAsTouched();
      this.createError.set('Warehouse name is required.');
      return;
    }

    const request: CreateWarehouseRequest = {
      name,
      type: value.type,
      isDefault: value.isDefault,
      allowSales: value.allowSales
    };

    this.createError.set(null);
    this.isCreating.set(true);

    this.warehouseService
      .createWarehouse(branchId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isCreating.set(false))
      )
      .subscribe({
        next: warehouse => {
          if (this.branchId() !== branchId) {
            return;
          }

          this.cancelDetailsRequest();
          this.selectedWarehouse.set(warehouse);
          this.warehouseDetailsError.set(null);
          this.isLoadingWarehouseDetails.set(false);
          this.lastCreatedWarehouse.set(warehouse);
          this.isCreateOpen.set(false);
          this.createForm.reset();

          this.notificationService.success(
            `Warehouse ${warehouse.code} created successfully.`,
            { title: 'Warehouse created' }
          );

          if (this.branchId() === branchId) {
            this.pageNumber.set(1);
            this.loadWarehouses();
            this.activeView.set('details');
          }
        },

        error: (error: HttpErrorResponse) => {
          const message = this.getCreateErrorMessage(error);

          this.createError.set(message);

          this.notificationService.error(
            message,
            { title: 'Warehouse creation failed' }
          );
        }
      });
  }

  // =========================================================
  // Directory Helpers
  // =========================================================

  private resetDirectoryForBranchChange(): void {
    this.cancelDirectoryRequest();
    this.cancelDetailsRequest();
    this.cancelUpdateRequest();
    this.isUpdating.set(false);
    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();

    this.selectedWarehouse.set(null);
    this.warehouseDetailsError.set(null);
    this.isLoadingWarehouseDetails.set(false);

    this.searchCode.set('');
    this.searchName.set('');

    this.selectedWarehouseType.set(null);
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();

    this.directoryError.set(null);
    this.isLoadingWarehouses.set(false);

    this.lastCreatedWarehouse.set(null);
    this.activeView.set('directory');

    if (!this.isCreating()) {
      this.isCreateOpen.set(false);
      this.createError.set(null);
    }
  }

  private clearDirectory(): void {
    this.warehouses.set([]);

    this.totalCount.set(0);
    this.totalPages.set(0);

    this.hasPreviousPage.set(false);
    this.hasNextPage.set(false);
  }

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

  private cancelUpdateRequest(): void {
    ++this.updateRequestVersion;
    this.updateSubscription?.unsubscribe();
    this.updateSubscription = null;
  }

  // =========================================================
  // Error Mapping
  // =========================================================

  private getUpdateErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'Invalid warehouse details. Review the form and try again.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to update warehouses.';
    }
    if (error.status === 404) {
      return 'The warehouse was not found. Return to the directory and refresh.';
    }
    if (error.status === 409) {
      return 'The warehouse has changed or has a dependency conflict. Reload its details before retrying.';
    }
    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }
    return 'Unable to update the warehouse. Please try again.';
  }

  private getWarehouseDetailsErrorMessage(
    error: HttpErrorResponse
  ): string {
    if (error.status === 400) {
      return 'Invalid warehouse or branch identifier.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view this warehouse.';
    }

    if (error.status === 404) {
      return 'The requested warehouse was not found in this branch.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load warehouse details. Please try again.';
  }

  private getDirectoryErrorMessage(
    error: HttpErrorResponse
  ): string {
    if (error.status === 400) {
      return 'Invalid warehouse search or filter parameters.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view warehouses.';
    }

    if (error.status === 404) {
      return 'The selected branch could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load warehouses. Please try again.';
  }

  private getCreateErrorMessage(
    error: HttpErrorResponse
  ): string {
    if (error.status === 400) {
      return 'Invalid warehouse details. Review the form and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to create warehouses.';
    }

    if (error.status === 404) {
      return 'The selected branch could not be found or is inactive.';
    }

    if (error.status === 409) {
      return 'A warehouse creation conflict occurred. Please retry.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to create the warehouse. Please try again.';
  }
}