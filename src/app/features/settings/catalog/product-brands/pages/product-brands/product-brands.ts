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
  ChangeProductBrandStatusRequest,
  CreateProductBrandRequest,
  ProductBrand,
  ProductBrandListQuery,
  ProductBrandPagedResult,
  UpdateProductBrandRequest
} from '../../models/product-brand.model';

import { ProductBrandService } from '../../service/product-brand.service';
import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';
import { EffectivePermissionService } from '../../../../../../core/authorization/effective-permission.service';
import { PermissionCodes } from '../../../../../../core/authorization/permission-registry';

type BrandActiveView = 'directory' | 'details';
type BrandSortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-product-brands',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './product-brands.html',
  styleUrl: './product-brands.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductBrands {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);
  private readonly brandService = inject(ProductBrandService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly permissionService = inject(EffectivePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // Workspace Context
  // =========================================================

  // Workspace selection is not an authorization boundary.
  // The backend validates company access on every request.

  readonly companyId = this.workspaceContext.companyId;

  // =========================================================
  // Permissions
  // =========================================================

  readonly canView = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBrands.view
    )
  );

  readonly canCreate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBrands.create
    )
  );

  readonly canUpdate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBrands.update
    )
  );

  readonly canActivate = computed(() =>
    this.permissionService.hasCompanyPermission(PermissionCodes.productBrands.activate)
  );

  readonly canDeactivate = computed(() =>
    this.permissionService.hasCompanyPermission(PermissionCodes.productBrands.deactivate)
  );

  readonly isChangingStatus = signal(false);
  readonly statusError = signal<string | null>(null);

  // =========================================================
  // Page State
  // =========================================================

  readonly activeView = signal<BrandActiveView>('directory');

  // =========================================================
  // Create State
  // =========================================================

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly lastCreatedBrand = signal<ProductBrand | null>(null);

  // =========================================================
  // Details / Edit State
  // =========================================================

  readonly selectedBrand = signal<ProductBrand | null>(null);
  readonly isLoadingBrandDetails = signal(false);
  readonly brandDetailsError = signal<string | null>(null);

  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);

  // =========================================================
  // Directory State
  // =========================================================

  readonly brands = signal<ProductBrand[]>([]);
  readonly isLoadingBrands = signal(false);
  readonly directoryError = signal<string | null>(null);

  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);

  readonly hasPreviousPage = computed(() =>
    this.pageNumber() > 1
  );

  readonly hasNextPage = computed(() =>
    this.pageNumber() < this.totalPages()
  );

  // =========================================================
  // Directory Filters
  // =========================================================

  readonly searchCode = signal('');
  readonly searchName = signal('');

  readonly selectedIsActive = signal<boolean | null>(null);
  readonly includeInactive = signal(false);

  readonly sortBy = signal('name');
  readonly sortDirection = signal<BrandSortDirection>('asc');

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
    ]]
  });

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [
      Validators.required,
      Validators.maxLength(200)
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
          this.loadBrands();
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
      this.isChangingStatus() ||
      this.isChangingStatus()
    ) {
      return;
    }

    this.closeEditBrand();
    this.cancelDetailsRequest();

    this.isLoadingBrandDetails.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {

    if (
      this.selectedBrand() === null ||
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

  loadBrands(): void {

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
      this.isLoadingBrands.set(false);
      this.directoryError.set(null);
      return;
    }

    const query: ProductBrandListQuery = {
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,
      isActive: this.selectedIsActive() ?? undefined,
      includeInactive: this.includeInactive(),
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingBrands.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.brandService
      .getProductBrands(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.directoryRequestVersion
          ) {
            this.isLoadingBrands.set(false);
          }
        })
      )
      .subscribe({
        next: (result: ProductBrandPagedResult) => {

          if (
            requestVersion !== this.directoryRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.brands.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPages.set(result.totalPages);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
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
    this.loadBrands();
  }

  // =========================================================
  // Directory Search
  // =========================================================

  searchBrands(code: string, name: string): void {

    this.searchCode.set(code.trim());
    this.searchName.set(name.trim());

    this.pageNumber.set(1);
    this.loadBrands();
  }

  clearSearch(): void {

    this.searchCode.set('');
    this.searchName.set('');

    this.pageNumber.set(1);
    this.loadBrands();
  }

  // =========================================================
  // Directory Filters
  // =========================================================

  filterByStatus(isActive: boolean | null): void {

    this.selectedIsActive.set(isActive);

    this.pageNumber.set(1);
    this.loadBrands();
  }

  setIncludeInactive(includeInactive: boolean): void {

    this.includeInactive.set(includeInactive);

    this.pageNumber.set(1);
    this.loadBrands();
  }

  clearFilters(): void {

    this.searchCode.set('');
    this.searchName.set('');
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.loadBrands();
  }

  // =========================================================
  // Sorting
  // =========================================================

  changeSorting(
    sortBy: string,
    direction: BrandSortDirection
  ): void {

    this.sortBy.set(sortBy);
    this.sortDirection.set(direction);

    this.pageNumber.set(1);
    this.loadBrands();
  }

  // =========================================================
  // Pagination
  // =========================================================

  previousPage(): void {

    if (
      this.isLoadingBrands() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(page =>
      Math.max(1, page - 1)
    );

    this.loadBrands();
  }

  nextPage(): void {

    if (
      this.isLoadingBrands() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(page => page + 1);

    this.loadBrands();
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

    this.loadBrands();
  }

  // =========================================================
  // Brand Details
  // =========================================================

  viewBrand(brandId: number): void {

    if (this.isChangingStatus()) return;

    const companyId = this.companyId();

    this.cancelDetailsRequest();

    const requestVersion = this.detailsRequestVersion;

    this.closeEditBrand();

    this.selectedBrand.set(null);
    this.lastCreatedBrand.set(null);
    this.brandDetailsError.set(null);
    this.statusError.set(null);
    this.isLoadingBrandDetails.set(false);

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      !Number.isSafeInteger(brandId) ||
      brandId <= 0 ||
      !this.canView()
    ) {
      this.brandDetailsError.set(
        'Select a valid company and product brand.'
      );

      this.activeView.set('details');
      return;
    }

    this.isCreateOpen.set(false);
    this.activeView.set('details');
    this.isLoadingBrandDetails.set(true);

    this.detailsSubscription = this.brandService
      .getProductBrandById(companyId, brandId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.detailsRequestVersion
          ) {
            this.isLoadingBrandDetails.set(false);
          }
        })
      )
      .subscribe({
        next: brand => {

          if (
            requestVersion !== this.detailsRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedBrand.set(brand);
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.detailsRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.brandDetailsError.set(
            this.getDetailsErrorMessage(error)
          );
        }
      });
  }

  refreshBrandDetails(): void {

    if (this.isChangingStatus() || this.isUpdating()) return;

    const brand = this.selectedBrand();

    if (brand) {
      this.viewBrand(brand.id);
    }
  }

  // =========================================================
  // Create Brand
  // =========================================================

  openCreateBrand(): void {

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
        'Select a company before creating a brand.',
        { title: 'Company selection required' }
      );
      return;
    }

    this.createForm.reset({
      name: ''
    });

    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }

  cancelCreateBrand(): void {

    if (this.isCreating()) {
      return;
    }

    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  createBrand(): void {

    if (
      !this.isCreateOpen() ||
      this.isCreating() ||
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
        'Select a valid company before creating a brand.'
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
      this.createForm.markAllAsTouched();
      this.createError.set('Brand name is required.');
      return;
    }

    const request: CreateProductBrandRequest = {
      name
    };

    this.cancelCreateRequest();

    const requestVersion = this.createRequestVersion;

    this.createError.set(null);
    this.isCreating.set(true);

    this.createSubscription = this.brandService
      .createProductBrand(companyId, request)
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
        next: brand => {

          if (
            requestVersion !== this.createRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.cancelDetailsRequest();

          this.selectedBrand.set(brand);
          this.lastCreatedBrand.set(brand);
          this.brandDetailsError.set(null);
          this.isLoadingBrandDetails.set(false);

          this.isCreateOpen.set(false);
          this.createForm.reset();

          this.notificationService.success(
            `Brand ${brand.code} created successfully.`,
            { title: 'Brand created' }
          );

          this.pageNumber.set(1);
          this.loadBrands();

          this.activeView.set('details');
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.createRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getCreateErrorMessage(error);

          this.createError.set(null);

          this.notificationService.error(
            message,
            { title: 'Brand creation failed' }
          );
        }
      });
  }

  // =========================================================
  // Edit Brand
  // =========================================================

  openEditBrand(): void {

    const brand = this.selectedBrand();

    if (
      !brand ||
      !this.canUpdate() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      this.isLoadingBrandDetails() ||
      this.companyId() !== brand.companyId
    ) {
      return;
    }

    this.editForm.reset({
      name: brand.name
    });

    this.updateError.set(null);
    this.isEditOpen.set(true);
  }

  closeEditBrand(): void {

    if (this.isUpdating()) {
      return;
    }

    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();
  }

  updateBrand(): void {

    if (
      !this.isEditOpen() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      !this.canUpdate()
    ) {
      return;
    }

    const brand = this.selectedBrand();
    const companyId = this.companyId();

    if (
      !brand ||
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      brand.companyId !== companyId ||
      !brand.rowVersion
    ) {
      this.updateError.set(
        'Brand details are unavailable. Reload and try again.'
      );
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();
    const name = value.name.trim();

    if (!name) {
      this.editForm.markAllAsTouched();
      this.updateError.set('Brand name is required.');
      return;
    }

    const request: UpdateProductBrandRequest = {
      name,
      rowVersion: brand.rowVersion
    };

    this.cancelUpdateRequest();

    const requestVersion = this.updateRequestVersion;

    this.updateError.set(null);
    this.isUpdating.set(true);

    this.updateSubscription = this.brandService
      .updateProductBrand(companyId, brand.id, request)
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

          this.selectedBrand.set(updated);

          this.brands.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.isEditOpen.set(false);
          this.editForm.reset();

          this.notificationService.success(
            `Brand ${updated.code} updated successfully.`,
            { title: 'Brand updated' }
          );

          this.loadBrands();
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.updateRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getUpdateErrorMessage(error);

          this.updateError.set(null);

          this.notificationService.error(
            message,
            { title: 'Brand update failed' }
          );
        }
      });
  }

  // =========================================================
  // Activate / Deactivate Brand
  // =========================================================

  changeBrandStatus(isActive: boolean): void {
    const brand = this.selectedBrand();
    const companyId = this.companyId();

    if (
      !brand || companyId === null || !Number.isSafeInteger(companyId) ||
      companyId <= 0 || brand.companyId !== companyId ||
      !brand.rowVersion || brand.isActive === isActive ||
      !this.canView() || this.isChangingStatus() || this.isUpdating() ||
      this.isEditOpen() || this.isCreating() || this.isLoadingBrandDetails() ||
      !(isActive ? this.canActivate() : this.canDeactivate())
    ) return;

    const request: ChangeProductBrandStatusRequest = { rowVersion: brand.rowVersion };
    this.cancelStatusRequest();
    const requestVersion = this.statusRequestVersion;
    this.statusError.set(null);
    this.isChangingStatus.set(true);

    const operation = isActive
      ? this.brandService.activateProductBrand(companyId, brand.id, request)
      : this.brandService.deactivateProductBrand(companyId, brand.id, request);

    this.statusSubscription = operation.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        if (requestVersion === this.statusRequestVersion) {
          this.isChangingStatus.set(false);
        }
      })
    ).subscribe({
      next: updated => {
        if (requestVersion !== this.statusRequestVersion ||
            this.companyId() !== companyId || !this.canView()) return;

        this.selectedBrand.set(updated);
        this.brands.update(items => items.map(item =>
          item.id === updated.id ? updated : item
        ));
        this.notificationService.success(
          `Brand ${updated.code} ${isActive ? 'activated' : 'deactivated'} successfully.`,
          { title: 'Brand status updated' }
        );
        this.loadBrands();
      },
      error: (error: HttpErrorResponse) => {
        if (requestVersion !== this.statusRequestVersion ||
            this.companyId() !== companyId) return;
        const message = this.getStatusErrorMessage(error);
        this.statusError.set(message);
        this.notificationService.error(message, { title: 'Brand status change failed' });
      }
    });
  }

  private getStatusErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) return 'Invalid brand status request. Reload the brand and try again.';
    if (error.status === 401 || error.status === 403) return 'You do not have permission to change this brand status.';
    if (error.status === 404) return 'The company or brand was not found. Refresh the directory.';
    if (error.status === 409) {
      const message = error.error?.message;
      return typeof message === 'string' && message.trim()
        ? message
        : 'This brand was changed by another request. Refresh its details before retrying.';
    }
    if (error.status === 0) return 'Unable to connect to the server. Check your connection.';
    return 'Unable to change brand status. Please try again.';
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

    this.selectedBrand.set(null);
    this.lastCreatedBrand.set(null);

    this.brandDetailsError.set(null);
    this.isLoadingBrandDetails.set(false);

    this.searchCode.set('');
    this.searchName.set('');
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();

    this.directoryError.set(null);
    this.isLoadingBrands.set(false);

    this.activeView.set('directory');
  }

  private clearDirectory(): void {

    this.brands.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
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
      return 'Invalid brand search or filter parameters.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view product brands.';
    }

    if (error.status === 404) {
      return 'The selected company could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load product brands. Please try again.';
  }

  private getDetailsErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid brand or company identifier.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view this brand.';
    }

    if (error.status === 404) {
      return 'The requested product brand was not found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load brand details. Please try again.';
  }

  private getCreateErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid brand details. Review the form and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to create product brands.';
    }

    if (error.status === 404) {
      return 'The selected company was not found.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'A conflict occurred while creating the product brand.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to create the brand. Please try again.';
  }

  private getUpdateErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid brand details.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to update product brands.';
    }

    if (error.status === 404) {
      return 'The brand was not found. Return to the directory and refresh.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'This brand has changed or has a dependency conflict. Reload its details before retrying.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to update the brand. Please try again.';
  }
}